"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWs = void 0;
const socket_io_1 = require("socket.io");
const aws_1 = require("./aws");
const path_1 = __importDefault(require("path"));
const fs_1 = require("./fs");
const pty_1 = require("./pty");
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const terminalManager = new pty_1.TerminalManager();
function initWs(httpServer) {
    console.log("initializing ws");
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });
    console.log("ws initialized");
    io.on("connection", (socket) => __awaiter(this, void 0, void 0, function* () {
        const replId = socket.handshake.query.roomId;
        if (!replId) {
            socket.disconnect();
            terminalManager.clear(socket.id);
            return;
        }
        const localDir = path_1.default.join(__dirname, `../tmp/${replId}`);
        yield (0, aws_1.fetchS3Folder)(`code/${replId}`, localDir);
        socket.emit("loaded", {
            rootContent: yield (0, fs_1.fetchDir)(localDir, "")
        });
        // Initialize file watcher
        (0, fs_1.watchDirRecursive)(localDir, socket, (dir) => __awaiter(this, void 0, void 0, function* () {
            const files = yield (0, fs_1.fetchDir)(dir, localDir);
            socket.emit("updateFileTree", files);
        }));
        initHandlers(socket, replId);
        console.log("user connected");
    }));
}
exports.initWs = initWs;
function initHandlers(socket, replId) {
    socket.on("disconnect", () => {
        console.log("user disconnected");
    });
    socket.on("fetchDir", (dir, callback) => __awaiter(this, void 0, void 0, function* () {
        try {
            const dirPath = path_1.default.join(__dirname, `../tmp/${replId}/${dir}`);
            const contents = yield (0, fs_1.fetchDir)(dirPath, dir);
            callback(contents);
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error fetching directory: ${error.message}`);
        }
    }));
    socket.on("fetchContent", (_a, callback_1) => __awaiter(this, [_a, callback_1], void 0, function* ({ path: filePath }, callback) {
        try {
            const fullPath = path_1.default.join(__dirname, `../tmp/${replId}/${filePath}`);
            const data = yield (0, fs_1.fetchFileContent)(fullPath);
            callback(data);
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error fetching file content: ${error.message}`);
        }
    }));
    socket.on("updateContent", (_b) => __awaiter(this, [_b], void 0, function* ({ path: filePath, content }) {
        try {
            const fullPath = path_1.default.join(__dirname, `../tmp/${replId}/${filePath}`);
            yield (0, fs_1.saveFile)(fullPath, content);
            yield (0, aws_1.saveToS3)(`code/${replId}`, filePath, content);
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error updating file content: ${error.message}`);
        }
    }));
    socket.on("createFile", (fileName) => __awaiter(this, void 0, void 0, function* () {
        try {
            const filePath = path_1.default.join(__dirname, `../tmp/${replId}/${fileName}`);
            yield (0, fs_1.createFile)(filePath);
            socket.emit("fileCreated", { type: "file", name: fileName, path: filePath });
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error creating file: ${error.message}`);
        }
    }));
    socket.on("createFolder", (folderName) => __awaiter(this, void 0, void 0, function* () {
        try {
            const folderPath = path_1.default.join(__dirname, `../tmp/${replId}/${folderName}`);
            yield (0, fs_1.createFolder)(folderPath);
            socket.emit("fileCreated", { type: "dir", name: folderName, path: folderPath });
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error creating folder: ${error.message}`);
        }
    }));
    socket.on("deleteItem", (itemPath) => __awaiter(this, void 0, void 0, function* () {
        try {
            const fullPath = path_1.default.join(__dirname, `../tmp/${replId}/${itemPath}`);
            yield (0, fs_1.deleteItem)(fullPath);
            socket.emit("fileDeleted", fullPath);
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error deleting item: ${error.message}`);
        }
    }));
    socket.on("renameItem", (_c) => __awaiter(this, [_c], void 0, function* ({ oldPath, newName }) {
        try {
            const oldFullPath = path_1.default.join(__dirname, `../tmp/${replId}/${oldPath}`);
            const newFullPath = path_1.default.join(path_1.default.dirname(oldFullPath), newName);
            yield (0, fs_1.renameItem)(oldFullPath, newFullPath);
            socket.emit("fileRenamed", { oldPath: oldFullPath, newPath: newFullPath });
        }
        catch (error) {
            //@ts-ignore
            console.error(`Error renaming item: ${error.message}`);
        }
    }));
    socket.on("requestTerminal", () => __awaiter(this, void 0, void 0, function* () {
        terminalManager.createPty(socket.id, replId, (data) => {
            socket.emit('terminal', {
                data: Buffer.from(data, "utf-8")
            });
        });
    }));
    socket.on("terminalData", (_d) => __awaiter(this, [_d], void 0, function* ({ data }) {
        terminalManager.write(socket.id, data);
    }));
    socket.on("pushToGitHub", (repositoryLink) => __awaiter(this, void 0, void 0, function* () {
        try {
            const codeDirectory = path_1.default.join(__dirname, `../tmp/${replId}`);
            const tempGitDir = path_1.default.join(__dirname, `../tempGitRepo`);
            // Ensure the temp Git repository directory is clean
            if (fs.existsSync(tempGitDir)) {
                fs.removeSync(tempGitDir);
            }
            fs.ensureDirSync(tempGitDir);
            // Copy the ${replId} contents to the temp Git repository directory
            fs.copySync(codeDirectory, tempGitDir);
            const git = simpleGit(tempGitDir);
            yield git.init();
            console.log("Initialized temporary Git repository in tempGitRepo");
            yield commitAndPushChanges(repositoryLink, git);
            socket.emit("githubPushResult", { success: true });
            console.log("Pushed changes to GitHub backend");
            // Clean up temporary Git repository directory
            fs.removeSync(tempGitDir);
        }
        catch (error) {
            console.error("Error pushing to GitHub:", error);
            //@ts-ignore
            socket.emit("githubPushResult", { success: false, error: error.message });
        }
    }));
    function commitAndPushChanges(repositoryLink, git) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Stage all files in the temporary Git repository
                yield git.add(['-A']);
                const status = yield git.status();
                // Check if there are changes to commit
                if (status.files.length > 0) {
                    yield git.commit('Updated code changes');
                    console.log('Committed updated code changes');
                }
                else {
                    console.log('No changes to commit');
                    return; // No changes to push if nothing was committed
                }
                yield git.removeRemote('origin').catch(() => { }); // Ignore errors if remote doesn't exist
                yield git.addRemote('origin', repositoryLink);
                try {
                    // Try fetching to check if the remote repository exists and has commits
                    yield git.fetch('origin', 'main');
                    const localRev = yield git.revparse(['HEAD']);
                    const remoteRev = yield git.revparse(['origin/main']);
                    if (localRev !== remoteRev) {
                        console.log('Local branch is behind the remote branch. Pulling changes...');
                        yield git.pull('origin', 'main', { '--allow-unrelated-histories': null });
                    }
                    else {
                        console.log('Local branch is up-to-date with the remote branch.');
                    }
                }
                catch (fetchError) {
                    console.log('No remote commits found or fetch failed. Pushing initial commit...');
                    yield git.branch(['-M', 'main']); // Ensure the branch is named 'main'
                }
                yield git.push('origin', 'main', { '--set-upstream': null });
            }
            catch (error) {
                //@ts-ignore
                throw new Error(`Error during commit and push to GitHub: ${error.message}`);
            }
        });
    }
}
