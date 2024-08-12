"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameItem = exports.deleteItem = exports.createFolder = exports.createFile = exports.saveFile = exports.fetchFileContent = exports.fetchDir = void 0;
const fs_1 = __importDefault(require("fs"));
const fetchDir = (dir, baseDir) => {
    return new Promise((resolve, reject) => {
        fs_1.default.readdir(dir, { withFileTypes: true }, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(files.map(file => ({ type: file.isDirectory() ? "dir" : "file", name: file.name, path: `${baseDir}/${file.name}` })));
            }
        });
    });
};
exports.fetchDir = fetchDir;
const fetchFileContent = (file) => {
    return new Promise((resolve, reject) => {
        fs_1.default.readFile(file, "utf8", (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
};
exports.fetchFileContent = fetchFileContent;
const saveFile = (file, content) => {
    return new Promise((resolve, reject) => {
        fs_1.default.writeFile(file, content, "utf8", (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.saveFile = saveFile;
const createFile = (filePath) => {
    return new Promise((resolve, reject) => {
        fs_1.default.writeFile(filePath, "", "utf8", (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.createFile = createFile;
const createFolder = (folderPath) => {
    return new Promise((resolve, reject) => {
        fs_1.default.mkdir(folderPath, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.createFolder = createFolder;
const deleteItem = (itemPath) => {
    return new Promise((resolve, reject) => {
        fs_1.default.rm(itemPath, { recursive: true, force: true }, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.deleteItem = deleteItem;
const renameItem = (oldPath, newPath) => {
    return new Promise((resolve, reject) => {
        fs_1.default.rename(oldPath, newPath, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.renameItem = renameItem;
