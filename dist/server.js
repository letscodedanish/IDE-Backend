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
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// Set up CORS to allow credentials
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173', // Allow only your frontend origin
    credentials: true // Enable credentials
}));
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
app.listen(3001, () => {
    console.log('Server is running on port 3001');
});
