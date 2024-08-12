import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';

export class TerminalManager {
    private sessions: { [id: string]: { terminal: ChildProcessWithoutNullStreams, replId: string } } = {};

    constructor() {
        this.sessions = {};
    }

    createPty(id: string, replId: string, onData: (data: string, id: number) => void) {
        const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'bash'; // Use ComSpec environment variable on Windows or fallback to 'cmd.exe'
        const term = spawn(shell, [], {
            cwd: path.join(__dirname, `../tmp/${replId}`),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        term.stdout.on('data', (data: Buffer) => {
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

        term.on('exit', (code: number | null, signal: string | null) => {
            console.log(`Terminal (PID ${term.pid}) exited with code ${code} and signal ${signal}`);
            delete this.sessions[id];
        });

        return term;
    }

    async executeGitCommand(terminalId: string, command: string): Promise<void> {
        const term = this.sessions[terminalId]?.terminal;
        if (term) {
            term.stdin.write(`git ${command}\n`);
        } else {
            throw new Error(`Terminal session ${terminalId} not found.`);
        }
    }

    async isGitInitialized(terminalId: string, directory: string): Promise<boolean> {
        const term = this.sessions[terminalId]?.terminal;
        if (term) {
            try {
                await this.executeGitCommand(terminalId, `--git-dir=${directory}`);
                return true; // Git is initialized
            } catch (error) {
                return false; // Git is not initialized
            }
        } else {
            throw new Error(`Terminal session ${terminalId} not found.`);
        }
    }
    

    write(terminalId: string, data: string) {
        const term = this.sessions[terminalId]?.terminal;
        if (term) {
            term.stdin.write(data + '\n');
            //you can write term.stdin.write(data + '\n') to automatically add a newline;
        }
    }

    clear(terminalId: string) {
        const term = this.sessions[terminalId]?.terminal;
        if (term) {
            term.kill();
            delete this.sessions[terminalId];
        }
    }
}
