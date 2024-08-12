import fs from "fs";
import path from "path";
import chokidar from 'chokidar';
import { Socket } from "socket.io";

interface File {
    type: "file" | "dir";
    name: string;
    path: string;
}

export const fetchDir = (dir: string, baseDir: string): Promise<File[]>  => {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, { withFileTypes: true }, (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files.map(file => ({ type: file.isDirectory() ? "dir" : "file", name: file.name, path: `${baseDir}/${file.name}`  })));
            }
        });       
    });
}

export const fetchFileContent = (file: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        fs.readFile(file, "utf8", (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

export const saveFile = (file: string, content: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.writeFile(file, content, "utf8", (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export const createFile = (filePath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, "", "utf8", (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export const createFolder = (folderPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.mkdir(folderPath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export const deleteItem = (itemPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.rm(itemPath, { recursive: true, force: true }, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

export const renameItem = (oldPath: string, newPath: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

