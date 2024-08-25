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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("./ws");
const http_2 = require("./http");
const cors_1 = __importDefault(require("cors"));
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const aws_1 = require("./aws");
const os_1 = __importDefault(require("os"));
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const port = process.env.PORT || 3001;
const httpServer = (0, http_1.createServer)(app);
(0, ws_1.initWs)(httpServer);
(0, http_2.initHttp)(app);
app.get('/health', (req, res) => {
    res.send('Backend is healthy nowww');
});
app.post('/OpenVsCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('OpenVsCode request received');
    const { replId, language } = req.body;
    console.log(`replId: ${replId}, language: ${language}`);
    if (!replId) {
        res.status(400).send('Bad request');
        return;
    }
    const homeDir = os_1.default.homedir();
    console.log(`Home directory: ${homeDir}`);
    const localDir = path_1.default.join(homeDir, 'Desktop', replId);
    console.log(`Local directory: ${localDir}`);
    try {
        // Fetch the folder from S3
        yield (0, aws_1.fetchS3Folder)(`base/${language}`, localDir);
        // Use VS Code CLI to open the folder
        (0, child_process_1.exec)(`code ${localDir}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error opening VS Code: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`VS Code STDERR: ${stderr}`);
                return;
            }
            console.log(`VS Code STDOUT: ${stdout}`);
        });
        res.send('Opening in VS Code');
    }
    catch (err) {
        console.error(`Error fetching S3 folder: ${err}`);
        res.status(500).send('Error opening in VS Code');
    }
}));
// Function to randomize User-Agent
const getRandomUserAgent = () => {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
};
// Add delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Function to fetch LeetCode profile
function fetchLeetCodeProfile(username) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const headers = {
                'User-Agent': getRandomUserAgent(),
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://leetcode.com/',
                'X-Request-ID': (0, uuid_1.v4)(),
            };
            const response = yield axios_1.default.get(`https://alfa-leetcode-api.onrender.com/userProfile/${username}/`, { headers });
            const basicResponse = yield axios_1.default.get(`https://alfa-leetcode-api.onrender.com/${username}/`, { headers });
            //@ts-ignore
            return Object.assign(Object.assign({}, response.data), basicResponse.data);
        }
        catch (error) {
            console.error(`Error fetching LeetCode data: ${error}`);
            throw error;
        }
    });
}
// Route to fetch LeetCode profile
app.post('/api/leetcode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    try {
        const data = yield fetchLeetCodeProfile(username);
        res.json({ data });
    }
    catch (error) {
        console.error('Error fetching LeetCode data:', error); // Log the error
        res.status(500).json({ error: 'Failed to fetch data' });
    }
}));
// Function to fetch Codeforces contests
app.get('/api/contests', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield axios_1.default.get('https://node.codolio.com/api/contest-calendar/v1/all/get-upcoming-contests');
        const contestsData = response.data;
        console.log('Fetched contest data:', contestsData);
        // Save the contest data to a JSON file
        const filePath = path_1.default.join(__dirname, 'contests.json');
        fs_1.default.writeFileSync(filePath, JSON.stringify(contestsData, null, 2));
        console.log('Saved contest data to local file');
        res.json(contestsData);
    }
    catch (error) {
        console.error('Error fetching contest data:', error);
        res.status(500).json({ error: 'Failed to fetch contest data' });
    }
}));
app.get('/api/stored-contests', (req, res) => {
    const filePath = path_1.default.join(__dirname, 'contests.json');
    if (fs_1.default.existsSync(filePath)) {
        res.sendFile(filePath);
    }
    else {
        res.status(404).json({ error: 'Contests data not found' });
    }
});
// Start the server
httpServer.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
