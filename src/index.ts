import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { initWs } from './ws';
import { initHttp } from './http';
import cors from 'cors';
import { exec } from 'child_process';
import path from 'path';
import { fetchS3Folder } from './aws';
import os from 'os';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3001;
const httpServer = createServer(app);

initWs(httpServer);
initHttp(app);

app.get('/health', (req, res) => {
  res.send('Backend is healthy');
});

app.post('/OpenVsCode', async (req, res) => {
  console.log('OpenVsCode request received');
  const { replId, language } = req.body;
  console.log(`replId: ${replId}, language: ${language}`);
  
  if (!replId) {
    res.status(400).send('Bad request');
    return;
  }

  const homeDir = os.homedir();
  console.log(`Home directory: ${homeDir}`);
  const localDir = path.join(homeDir, 'Desktop', replId);
  console.log(`Local directory: ${localDir}`);
  
  try {
    // Fetch the folder from S3
    await fetchS3Folder(`base/${language}`, localDir);

    // Use VS Code CLI to open the folder
    exec(`code ${localDir}`, (error, stdout, stderr) => {
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
  } catch (err) {
    console.error(`Error fetching S3 folder: ${err}`);
    res.status(500).send('Error opening in VS Code');
  }
});

// Function to randomize User-Agent
const getRandomUserAgent = (): string => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

// Add delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to fetch LeetCode profile
async function fetchLeetCodeProfile(username: string): Promise<any> {
  try {
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://leetcode.com/',
      'X-Request-ID': uuidv4(),
    };

    const response = await axios.get(`https://alfa-leetcode-api.onrender.com/userProfile/${username}/`, { headers });
    const basicResponse = await axios.get(`https://alfa-leetcode-api.onrender.com/${username}/`, { headers });
    //@ts-ignore
    return { ...response.data, ...basicResponse.data };
  } catch (error) {
    console.error(`Error fetching LeetCode data: ${error}`);
    throw error;
  }
}

// Route to fetch LeetCode profile
app.post('/api/leetcode', async (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    const data = await fetchLeetCodeProfile(username);
    res.json({ data });
  } catch (error) {
    console.error('Error fetching LeetCode data:', error); // Log the error
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Function to fetch Codeforces contests
const fetchCodeforcesContests = async (): Promise<any[]> => {
  try {
    // Introduce a delay to mimic real user interaction
    await delay(Math.random() * 2000 + 1000);

    const response = await axios.get('https://codeforces.com/api/contest.list', {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://codeforces.com/',
        'X-Request-ID': uuidv4(),
      }
    });
    //@ts-ignore
    return response.data.result.map((contest: any) => ({
      platform: 'Codeforces',
      name: contest.name,
      startDate: new Date(contest.startTimeSeconds * 1000),
      endDate: new Date(contest.startTimeSeconds * 1000 + contest.durationSeconds * 1000),
    }));
  } catch (error) {
    console.error('Error fetching Codeforces contests:', (error as any).response?.data || 'Unknown error'); // Log the error
    throw error;
  }
};

// Route to fetch contests (currently only from Codeforces)
app.post('/api/contests', async (req: Request, res: Response) => {
  try {
    const contests = await fetchCodeforcesContests();
    res.json(contests);
  } catch (error) {
    console.error('Error fetching contests:', error); // Log the error
    res.status(500).json({ error: 'Failed to fetch contests' });
  }
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
