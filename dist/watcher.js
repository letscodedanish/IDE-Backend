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
exports.watchDirRecursive = void 0;
const chokidar_1 = __importDefault(require("chokidar"));
const fs_1 = require("./fs");
function watchDirRecursive(dir, socket) {
    const watcher = chokidar_1.default.watch(dir, {
        persistent: true,
        ignoreInitial: true,
        alwaysStat: true,
        followSymlinks: true,
        ignored: [
            'node_modules',
            '.git',
            '.next'
        ]
    });
    const emitFileTreeUpdate = () => __awaiter(this, void 0, void 0, function* () {
        const updatedDir = yield (0, fs_1.fetchDir)(dir, '');
        socket.emit('fileTreeUpdate', updatedDir);
    });
    watcher.on('add', emitFileTreeUpdate);
    watcher.on('change', emitFileTreeUpdate);
    watcher.on('unlink', emitFileTreeUpdate);
    watcher.on('addDir', emitFileTreeUpdate);
    watcher.on('unlinkDir', emitFileTreeUpdate);
    watcher.on('error', (error) => {
        console.error('Error watching directory:', error);
    });
}
exports.watchDirRecursive = watchDirRecursive;
