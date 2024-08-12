import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { fetchS3Folder, saveToS3 } from "./aws";
import path from "path";
import { fetchDir, fetchFileContent, saveFile, createFile, createFolder, deleteItem, renameItem } from "./fs";
import { TerminalManager } from "./pty";
import { exec } from 'child_process';

const simpleGit = require('simple-git');
const fs = require('fs-extra');

const terminalManager = new TerminalManager();

export function initWs(httpServer: HttpServer) {
    console.log("initializing ws");
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    console.log("ws initialized");
    io.on("connection", async (socket) => {
        const replId = socket.handshake.query.roomId as string; 

        if (!replId) {
            socket.disconnect();
            terminalManager.clear(socket.id);
            return;
        }

        const localDir = path.join(__dirname, `../tmp/${replId}`);
        await fetchS3Folder(`code/${replId}`, localDir);
        socket.emit("loaded", {
            rootContent: await fetchDir(localDir, "")
        });
        

        initHandlers(socket, replId);
        console.log("user connected");
    });
}

function initHandlers(socket: Socket, replId: string) {
    socket.on("disconnect", () => {
        console.log("user disconnected");
    });

    socket.on("fetchDir", async (dir: string, callback) => {
        try {
            const dirPath = path.join(__dirname, `../tmp/${replId}/${dir}`);
            const contents = await fetchDir(dirPath, dir);
            callback(contents);
        } catch (error) {
            //@ts-ignore
            console.error(`Error fetching directory: ${error.message}`);
        }
    });

    socket.on("fetchContent", async ({ path: filePath }: { path: string }, callback) => {
        try {
            const fullPath = path.join(__dirname, `../tmp/${replId}/${filePath}`);
            const data = await fetchFileContent(fullPath);
            callback(data);
        } catch (error) {
            //@ts-ignore
            console.error(`Error fetching file content: ${error.message}`);
        }
    });

    socket.on("updateContent", async ({ path: filePath, content }: { path: string, content: string }) => {
        try {
            const fullPath = path.join(__dirname, `../tmp/${replId}/${filePath}`);
            await saveFile(fullPath, content);
            await saveToS3(`code/${replId}`, filePath, content);
        } catch (error) {
            //@ts-ignore
            console.error(`Error updating file content: ${error.message}`);
        }
    });

    socket.on("createFile", async (fileName: string) => {
        try {
            const filePath = path.join(__dirname, `../tmp/${replId}/${fileName}`);
            await createFile(filePath);
            socket.emit("fileCreated", { type: "file", name: fileName, path: filePath });
            
        } catch (error) {
            //@ts-ignore
            console.error(`Error creating file: ${error.message}`);
        }
    });

    socket.on("createFolder", async (folderName: string) => {
        try {
            const folderPath = path.join(__dirname, `../tmp/${replId}/${folderName}`);
            await createFolder(folderPath);
            socket.emit("fileCreated", { type: "dir", name: folderName, path: folderPath });
        } catch (error) {
            //@ts-ignore
            console.error(`Error creating folder: ${error.message}`);
        }
    });

    socket.on("deleteItem", async (itemPath: string) => {
        try {
            const fullPath = path.join(__dirname, `../tmp/${replId}/${itemPath}`);
            await deleteItem(fullPath);
            socket.emit("fileDeleted", fullPath);
        } catch (error) {
            //@ts-ignore
            console.error(`Error deleting item: ${error.message}`);
        }
    });

    socket.on("renameItem", async ({ oldPath, newName }: { oldPath: string, newName: string }) => {
        try {
            const oldFullPath = path.join(__dirname, `../tmp/${replId}/${oldPath}`);
            const newFullPath = path.join(path.dirname(oldFullPath), newName);
            await renameItem(oldFullPath, newFullPath);
            socket.emit("fileRenamed", { oldPath: oldFullPath, newPath: newFullPath });
        } catch (error) {
            //@ts-ignore
            console.error(`Error renaming item: ${error.message}`);
        }
    });

    socket.on("requestTerminal", async () => {
        terminalManager.createPty(socket.id, replId, (data: string) => {
            socket.emit('terminal', {
                data: Buffer.from(data,"utf-8")
            });
        });
    });

    socket.on("terminalData", async ({ data }: { data: string }) => {
        terminalManager.write(socket.id, data);
    });

    socket.on("pushToGitHub", async (repositoryLink: string) => {
        const codeDirectory = path.join(__dirname, `../tmp/${replId}`);
        const tempGitRepo = path.join(__dirname, `../tempGitRepo`);
    
        try {
            // Ensure the tempGitRepo directory exists
            await fs.ensureDir(tempGitRepo);

            // Initialize or reinitialize the temporary Git repository
            const git = simpleGit(tempGitRepo);
            await git.init();
    
            // Remove all files in the temporary Git repository
            await fs.emptyDir(tempGitRepo);
    
            // Copy the code from the code directory to the temporary Git repository
            await copyDirectory(codeDirectory, tempGitRepo);
    
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
                    console.log('Pulled changes from remote repository');
                }
            } catch (fetchError) {
                console.log('No remote commits found or fetch failed. Pushing initial commit...');
            }
    
            // Push the code changes
            await git.push('origin', 'main');
            socket.emit("githubPushResult", { success: true });
            console.log("Pushed to GitHub");
        } catch (error: any) {
            console.error("Error pushing to GitHub:", error);
            socket.emit("githubPushResult", { success: false, error: error.message });
        }
    });

    socket.on("importFromGitHub", async (repositoryLink: string) => {
        const codeDirectory = path.join(__dirname, `../tmp/${replId}`);
        console.log("Importing from GitHub:", repositoryLink);
    
        try {
            // Clone the repository into the code directory
            await simpleGit().clone(repositoryLink, codeDirectory);
            console.log("Cloned repository from GitHub");
    
            // Read the directory contents
            const files = await readDirectory(codeDirectory);
            console.log("Read directory contents");
    
            // Emit the files to the frontend to display
            socket.emit("githubImportResult", { success: true, files });
            console.log("Emitted files to frontend");
            console.log("Imported from GitHub");
        } catch (error: any) {
            console.error("Error importing from GitHub:", error);
            socket.emit("githubImportResult", { success: false, error: error.message });
        }
    });
    
    async function readDirectory(directory: string): Promise<any[]> {
        const fs = require('fs');
        const path = require('path');
        const fse = require('fs-extra');
    
        const files = [];
    
        const items = await fs.promises.readdir(directory);
    
        for (const item of items) {
            const itemPath = path.join(directory, item);
            const stat = await fs.promises.stat(itemPath);
    
            if (stat.isDirectory()) {
                files.push({
                    name: item,
                    type: 'directory',
                    children: await readDirectory(itemPath)
                });
            } else {
                files.push({
                    name: item,
                    type: 'file',
                    content: await fs.promises.readFile(itemPath, 'utf-8')
                });
            }
        }
    
        return files;
    }
    
    
    async function copyDirectory(srcDir: string, destDir: string) {
        const fs = require('fs');
        const path = require('path');
        const fse = require('fs-extra');
    
        await fse.ensureDir(destDir);
    
        const items = await fs.promises.readdir(srcDir);
    
        for (const item of items) {
            const srcPath = path.join(srcDir, item);
            const destPath = path.join(destDir, item);
            const stat = await fs.promises.stat(srcPath);
    
            if (stat.isDirectory()) {
                await copyDirectory(srcPath, destPath);
            } else {
                await fs.promises.copyFile(srcPath, destPath);
            }
        }
    }
    
    // async function commitAndPushChanges(repositoryLink: string, git: any) {
    //     try {
    //         // Stage all files in the temporary Git repository
    //         await git.add(['-A']);
    
    //         const status = await git.status();
            
    //         // Check if there are changes to commit
    //         if (status.files.length > 0) {
    //             await git.commit('Updated code changes');
    //             console.log('Committed updated code changes');
    //         } else {
    //             console.log('No changes to commit');
    //             return; // No changes to push if nothing was committed
    //         }
            
    //         await git.removeRemote('origin').catch(() => {}); // Ignore errors if remote doesn't exist
    //         await git.addRemote('origin', repositoryLink);
    
    //         try {
    //             // Try fetching to check if the remote repository exists and has commits
    //             await git.fetch('origin', 'main');
    //             const localRev = await git.revparse(['HEAD']);
    //             const remoteRev = await git.revparse(['origin/main']);
    
    //             if (localRev !== remoteRev) {
    //                 console.log('Local branch is behind the remote branch. Pulling changes...');
    //                 await git.pull('origin', 'main', { '--allow-unrelated-histories': null });
    //             } else {
    //                 console.log('Local branch is up-to-date with the remote branch.');
    //             }
    //         } catch (fetchError) {
    //             console.log('No remote commits found or fetch failed. Pushing initial commit...');
    //             await git.branch(['-M', 'main']); // Ensure the branch is named 'main'
    //         }
    
    //         await git.push('origin', 'main', { '--set-upstream': null });
    //     } catch (error) {
    //         //@ts-ignore
    //         throw new Error(`Error during commit and push to GitHub: ${error.message}`);
    //     }
    // }
    
}
