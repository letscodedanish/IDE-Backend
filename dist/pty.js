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
exports.TerminalManager = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
class TerminalManager {
    constructor() {
        this.sessions = {};
        this.sessions = {};
    }
    createPty(id, replId, onData) {
        const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'bash'; // Use ComSpec environment variable on Windows or fallback to 'cmd.exe'
        const term = (0, child_process_1.spawn)(shell, [], {
            cwd: path_1.default.join(__dirname, `../tmp/${replId}`),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        term.stdout.on('data', (data) => {
            // @ts-ignore
            onData(data.toString(), term.pid);
        });
        term.stderr.on('data', (data) => {
            console.error(`Error from terminal (PID ${term.pid}): ${data.toString()}`);
        });
        this.sessions[id] = {
            terminal: term,
            replId
        };
        term.on('exit', (code, signal) => {
            console.log(`Terminal (PID ${term.pid}) exited with code ${code} and signal ${signal}`);
            delete this.sessions[id];
        });
        return term;
    }
    executeGitCommand(terminalId, command) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const term = (_a = this.sessions[terminalId]) === null || _a === void 0 ? void 0 : _a.terminal;
            if (term) {
                term.stdin.write(`git ${command}\n`);
            }
            else {
                throw new Error(`Terminal session ${terminalId} not found.`);
            }
        });
    }
    isGitInitialized(terminalId, directory) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const term = (_a = this.sessions[terminalId]) === null || _a === void 0 ? void 0 : _a.terminal;
            if (term) {
                try {
                    yield this.executeGitCommand(terminalId, `--git-dir=${directory}`);
                    return true; // Git is initialized
                }
                catch (error) {
                    return false; // Git is not initialized
                }
            }
            else {
                throw new Error(`Terminal session ${terminalId} not found.`);
            }
        });
    }
    write(terminalId, data) {
        var _a;
        const term = (_a = this.sessions[terminalId]) === null || _a === void 0 ? void 0 : _a.terminal;
        if (term) {
            term.stdin.write(data + '\n');
            //you can write term.stdin.write(data + '\n') to automatically add a newline;
        }
    }
    clear(terminalId) {
        var _a;
        const term = (_a = this.sessions[terminalId]) === null || _a === void 0 ? void 0 : _a.terminal;
        if (term) {
            term.kill();
            delete this.sessions[terminalId];
        }
    }
}
exports.TerminalManager = TerminalManager;
