import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { fetchS3Folder, saveToS3 } from "./aws";
import path from "path";
import { 
    fetchDir, 
    fetchFileContent, 
    saveFile, 
    createFile, 
    createFolder, 
    deleteItem, 
    renameItem 
} from "./fs";
import { TerminalManager } from "./pty";
import Docker from 'dockerode';
import fs from 'fs-extra';

const simpleGit = require('simple-git');
const ioClient = require('socket.io-client'); // Import the client for socket.io

const docker = new Docker({ host: '127.0.0.1', port: 2375 });
const terminalManager = new TerminalManager();

// Global mappings for playground connections
const connectionObject_Id_TO_Port: { [key: string]: { port: number; container_id: string } } = {};
const connectionObject_Port_TO_ID: { [key: number]: string } = {};




// Function to initialize WebSocket server
export function initWs(httpServer: HttpServer) {
    console.log("Initializing WebSocket server...");
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    console.log("WebSocket server initialized.");

    io.on("connection", async (socket) => {
        const replId = socket.handshake.query.roomId as string;

        if (!replId) {
            console.warn("No roomId provided. Disconnecting socket.");
            socket.disconnect();
            terminalManager.clear(socket.id);
            return;
        }

        try {
            // Step 1: Create and start a Docker container for the REPL
            console.log(`Creating Docker container for REPL ID: ${replId}`);
            const containerId = await createAndRunContainer(3333, replId);

            // Store mappings
            connectionObject_Id_TO_Port[replId] = { port: 3333, container_id: containerId };
            connectionObject_Port_TO_ID[3333] = replId;

            // Step 2: Fetch code from S3 inside the container
            console.log("Fetching code from S3 into the container...");
            const containerDir = `/workspace/${replId}`;
            await execInContainer(containerId, `mkdir -p ${containerDir}`);
            await execInContainer(containerId, `aws s3 cp s3://repl/code/${replId} ${containerDir} --recursive`);
            console.log("Code fetched and copied to container.");

            // Step 3: Emit loaded event with root directory content
            const rootContent = await fetchDir(containerDir, "");
            socket.emit("loaded", { rootContent });
            console.log("Emitted 'loaded' event to client.");

            // Step 4: Initialize event handlers
            initHandlers(socket, replId, containerId, containerDir);
            console.log("Initialized event handlers for the client.");

            // Step 5: Setup playground connection
            setupPlaygroundConnection(socket, replId, containerId, containerDir);
            console.log("Set up playground connection.");

        } catch (error) {
            console.error(`Error during connection setup for REPL ID ${replId}:`, error);
            socket.emit("error", { message: "Internal server error during setup." });
            socket.disconnect();
            terminalManager.clear(socket.id);
        }
    });
}

// Function to fetch directory content inside a Docker container
async function fetchDirInContainer(containerId: string, dirPath: string): Promise<any[]> {
    try {
        const lsOutput = await execInContainer(containerId, `ls -l ${dirPath}`);
        // Parse `ls -l` output to extract file/folder names and details
        const items = lsOutput.split('\n').slice(1).map(line => {
            const parts = line.split(/\s+/);
            const isDirectory = line.startsWith('d');
            const name = parts[8];
            return { name, isDirectory, path: `${dirPath}/${name}` };
        });
        return items;
    } catch (error) {
        console.error(`Error fetching directory '${dirPath}' in container '${containerId}':`, error);
        throw error;
    }
}
// Function to execute a command inside a Docker container
async function execInContainer(containerId: string, command: string): Promise<string> {
    try {
        const container = docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: ['sh', '-c', command],
            AttachStdout: true,
            AttachStderr: true
        });

        const stream = await exec.start({});
        let output = '';

        await new Promise<void>((resolve, reject) => {
            stream.on('data', (data: Buffer) => {
                const chunk = data.toString();
                output += chunk;
                console.log(`Container ${containerId} output: ${chunk}`);
            });
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        return output;
    } catch (error) {
        console.error(`Error executing command in container ${containerId}:`, error);
        throw error;
    }
}

// Function to initialize various event handlers for the socket
function initHandlers(socket: Socket, replId: string, containerId: string, containerDir: string) {
    // Handle socket disconnection
    socket.on("disconnect", async () => {
        console.log(`Client disconnected from REPL ID: ${replId}`);
        await stopAndRemoveContainer(containerId);
        delete connectionObject_Id_TO_Port[replId];
        delete connectionObject_Port_TO_ID[3333]; // Assuming port 3333 is used
    });

    // Fetch directory contents
    socket.on("fetchDir", async (dir: string, callback) => {
        try {
            const dirPath = path.join(containerDir, dir);
            const contents = await fetchDirInContainer(containerId, dirPath);
            callback(contents);
        } catch (error) {
            console.error(`Error fetching directory '${dir}':`, error);
            callback({ error: (error as any).message });
        }
    });

    // Fetch file content
    socket.on("fetchContent", async ({ path: filePath }: { path: string }, callback) => {
        try {
            const fullPath = path.join(containerDir, filePath);
            const data = await fetchFileContent(fullPath);
            callback(data);
        } catch (error) {
            console.error(`Error fetching content for file '${filePath}':`, error);
            callback({ error: (error as any).message });
        }
    });

    // Update file content
    socket.on("updateContent", async ({ path: filePath, content }: { path: string; content: string }) => {
        try {
            const fullPath = path.join(containerDir, filePath);
            await saveFile(fullPath, content);
            await saveToS3(`code/${replId}`, filePath, content);
            console.log(`Updated content for file '${filePath}'.`);
        } catch (error) {
            console.error(`Error updating content for file '${filePath}':`, error);
        }
    });

    // Create a new file
    socket.on("createFile", async (fileName: string) => {
        try {
            const filePath = path.join(containerDir, fileName);
            await createFile(filePath);
            socket.emit("fileCreated", { type: "file", name: fileName, path: filePath });
            console.log(`Created new file '${fileName}'.`);
        } catch (error) {
            console.error(`Error creating file '${fileName}':`, error);
        }
    });

    // Create a new folder
    socket.on("createFolder", async (folderName: string) => {
        try {
            const folderPath = path.join(containerDir, folderName);
            await createFolder(folderPath);
            socket.emit("fileCreated", { type: "dir", name: folderName, path: folderPath });
            console.log(`Created new folder '${folderName}'.`);
        } catch (error) {
            console.error(`Error creating folder '${folderName}':`, error);
        }
    });

    // Delete an item (file or folder)
    socket.on("deleteItem", async (itemPath: string) => {
        try {
            const fullPath = path.join(containerDir, itemPath);
            await deleteItem(fullPath);
            socket.emit("fileDeleted", fullPath);
            console.log(`Deleted item '${itemPath}'.`);
        } catch (error) {
            console.error(`Error deleting item '${itemPath}':`, error);
        }
    });

    // Rename an item (file or folder)
    socket.on("renameItem", async ({ oldPath, newName }: { oldPath: string; newName: string }) => {
        try {
            const oldFullPath = path.join(containerDir, oldPath);
            const newFullPath = path.join(path.dirname(oldFullPath), newName);
            await renameItem(oldFullPath, newFullPath);
            socket.emit("fileRenamed", { oldPath: oldFullPath, newPath: newFullPath });
            console.log(`Renamed item from '${oldPath}' to '${newName}'.`);
        } catch (error) {
            console.error(`Error renaming item from '${oldPath}' to '${newName}':`, error);
        }
    });

    // Request for terminal access
    socket.on("requestTerminal", async () => {
        terminalManager.createPty(socket.id, replId, (data: string) => {
            socket.emit('terminal', { data: Buffer.from(data, "utf-8") });
        });
        console.log("Terminal access requested.");
    });

    // Receive terminal data from client
    socket.on("terminalData", async ({ data }: { data: string }) => {
        terminalManager.write(socket.id, data);
    });

    // Push changes to GitHub
    socket.on("pushToGitHub", async (repositoryLink: string) => {
        const tempGitRepo = path.join(containerDir, `../tempGitRepo`);

        try {
            // Ensure the tempGitRepo directory exists
            await fs.ensureDir(tempGitRepo);

            // Initialize or reinitialize the temporary Git repository
            const git = simpleGit(tempGitRepo);
            await git.init();

            // Remove all files in the temporary Git repository
            await fs.emptyDir(tempGitRepo);

            // Copy the code from the code directory to the temporary Git repository
            await copyDirectory(containerDir, tempGitRepo);

            // Commit the code changes
            await git.add('.');
            await git.commit('Updated code changes');

            // Set the remote repository
            const remotes = await git.getRemotes(true);
            if (!remotes.find((remote: any) => remote.name === 'origin')) {
                await git.addRemote('origin', repositoryLink);
            }

            // Check if there are remote commits and pull them if necessary
            try {
                await git.fetch('origin', 'main');
                const status = await git.status();
                if (status.behind > 0) {
                    await git.pull('origin', 'main', { '--allow-unrelated-histories': null });
                    console.log('Pulled changes from remote repository.');
                }
            } catch (fetchError) {
                console.log('No remote commits found or fetch failed. Pushing initial commit...');
            }

            // Push the code changes
            await git.push('origin', 'main');
            socket.emit("githubPushResult", { success: true });
            console.log("Pushed changes to GitHub.");
        } catch (error: any) {
            console.error("Error pushing to GitHub:", error);
            socket.emit("githubPushResult", { success: false, error: error.message });
        }
    });

    // Import code from GitHub
    socket.on("importFromGitHub", async (repositoryLink: string) => {
        console.log("Importing from GitHub:", repositoryLink);

        try {
            // Clone the repository into the code directory
            await simpleGit().clone(repositoryLink, containerDir);
            console.log("Cloned repository from GitHub.");

            // Read the directory contents
            const files = await readDirectory(containerDir);
            console.log("Read directory contents.");

            // Emit the files to the frontend to display
            socket.emit("githubImportResult", { success: true, files });
            console.log("Emitted files to frontend.");
        } catch (error: any) {
            console.error("Error importing from GitHub:", error);
            socket.emit("githubImportResult", { success: false, error: error.message });
        }
    });
}

// Function to set up playground connection after container creation
function setupPlaygroundConnection(socket: Socket, replId: string, containerId: string, containerDir: string) {
    socket.on("connect-to-playground", (playground_id: string) => {
        console.log(`Client requested to connect to playground ID: ${playground_id}`);

        // Retrieve the port for the playground
        const playgroundConnection = connectionObject_Id_TO_Port[playground_id];
        if (!playgroundConnection) {
            console.error(`No connection found for playground ID: ${playground_id}`);
            socket.emit("error", { message: `Playground ID ${playground_id} not found.` });
            return;
        }

        const domain = 'your-domain-here'; // Replace with your actual domain or retrieve dynamically
        const port = playgroundConnection.port;

        // Establish a client socket connection to the playground
        const socket_client = ioClient(`${domain}:${port}`);

        // Handle connection errors
        socket_client.on("connect_error", (err: any) => {
            console.error(`Connection error to playground ${playground_id}:`, err);
            socket.emit("error", { message: `Failed to connect to playground ${playground_id}.` });
        });

        // Relay output from playground to the main client
        socket_client.on("output", (msg: any) => {
            socket.emit("output", msg);
        });

        console.log(`Connected to playground ${playground_id} at ${domain}:${port}`);

        // Handle file browsing requests
        socket.on("file_browser", async (playgroundType: string, playgroundName: string, callback: Function) => {
            console.log(`Requesting file_browser from playground ${playgroundName}`);
            socket_client.emit("file_browser", playgroundType, playgroundName, ({ directory_structure }: any) => {
                console.log("Received directory structure from playground.");
                callback({ directory_structure });
            });
        });

        // Handle file provision requests
        socket.on("providefile", async (playgroundName: string, playgroundType: string, filename: string, callback: Function) => {
            console.log(`Requesting file '${filename}' from playground ${playgroundName}`);
            socket_client.emit("providefile", playgroundName, playgroundType, filename, (content: any) => {
                console.log(`Received content for file '${filename}' from playground.`);
                callback(content);
            });
        });

        // Handle command execution requests
        socket.on("execute", (command: string, playgroundName: string, playgroundType: string) => {
            console.log(`Executing command '${command}' on playground ${playgroundName}`);
            socket_client.emit("execute", command, playgroundName, playgroundType);
            console.log("Sent execute request to playground.");
        });

        // Handle file update requests
        socket.on("update-file", async (playgroundName: string, playgroundType: string, filenames: string[], callback: Function) => {
            console.log(`Updating files on playground ${playgroundName}:`, filenames);
            socket_client.emit("update-file", playgroundName, playgroundType, filenames, (fileContent: any) => {
                callback(fileContent);
                socket.emit("file-provided", true);
                console.log("File updated on playground.");
            });
        });

        // Handle playground save requests
        socket.on("saveplayground", async (playgroundName: string, playgroundType: string, callback: Function) => {
            console.log(`Saving playground ${playgroundName}`);
            socket_client.emit("saveplayground", playgroundName, playgroundType, (data: any) => {
                console.log(`Playground ${playgroundName} saved. Cleaning up.`);
                // Stop and remove the container associated with the playground
                removeContainer(connectionObject_Id_TO_Port[playgroundName].container_id);
                const portToDelete = connectionObject_Id_TO_Port[playgroundName].port;
                delete connectionObject_Id_TO_Port[playgroundName];
                delete connectionObject_Port_TO_ID[portToDelete];
                console.log("Playground saved and container cleaned up.");
                callback("project_saved");
                socket_client.disconnect();
            });
        });
    });
}

// Function to create and start a Docker container
async function createAndRunContainer(port: number, replId: string): Promise<string> {
    try {
        // Optionally, pull the Docker image if not present
        /*
        await new Promise<void>((resolve, reject) => {
            docker.pull('100xdevs/runner:latest', (err, stream) => {
                if (err) {
                    return reject(err);
                }
                docker.modem.followProgress(stream, (pullErr: any, output: any) => {
                    if (pullErr) {
                        return reject(pullErr);
                    }
                    console.log('Docker image pulled successfully.');
                    resolve();
                });
            });
        });
        */

        // Create the Docker container
        const container = await docker.createContainer({
            Image: 'sagarsingh2003/codearena-server:v0.0.2',
            name: replId,
            HostConfig: {
                PortBindings: {
                    '3333/tcp': [{ HostPort: `${port}` }],
                },
            },
        });

        // Start the Docker container
        await container.start();
        console.log(`Docker container '${replId}' created and started with ID: ${container.id}`);

        // Install AWS CLI in the container
        // await execInContainer(container.id, 'apt-get update && apt-get install -y awscli');
        // console.log('AWS CLI installed in the container.');

        return container.id;

    } catch (error) {
        console.error(`Error creating or starting Docker container '${replId}':`, error);
        throw error;
    }
}

// Function to stop and remove a Docker container
async function stopAndRemoveContainer(containerId: string) {
    try {
        const container = docker.getContainer(containerId);
        await container.stop();
        await container.remove();
        console.log(`Docker container '${containerId}' stopped and removed.`);
    } catch (error) {
        console.error(`Error stopping or removing Docker container '${containerId}':`, error);
    }
}

// Function to remove a container without waiting for the socket disconnection
async function removeContainer(containerId: string) {
    try {
        const container = docker.getContainer(containerId);
        await container.stop();
        await container.remove();
        console.log(`Docker container '${containerId}' stopped and removed.`);
    } catch (error) {
        console.error(`Error stopping or removing Docker container '${containerId}':`, error);
    }
}

// Function to read directory contents
async function readDirectory(directory: string): Promise<any[]> {
    const files: any[] = [];

    const items = await fs.promises.readdir(directory);

    for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = await fs.promises.lstat(itemPath);
        files.push({
            name: item,
            path: itemPath,
            isDirectory: stats.isDirectory()
        });
    }

    return files;
}

// Function to copy directory contents
async function copyDirectory(source: string, destination: string) {
    await fs.copy(source, destination);
}
