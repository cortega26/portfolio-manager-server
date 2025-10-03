import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve('./data');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure data directory exists
fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

/**
 * Fetch daily historical price data for a US stock from Stooq.
 * Returns an array of objects with date (ISO string) and close price (number).
 * Stooq CSV columns: Date, Open, High, Low, Close, Volume
 */
async function fetchHistoricalPrices(symbol, range = '1y') {
  try {
    const urlSymbol = symbol.toLowerCase().replace('.', '').replace('/', '');
    const url = `https://stooq.com/q/d/l/?s=${urlSymbol}&i=d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch price for ${symbol}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    const result = [];
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const [date, open, high, low, close, volume] = lines[i].split(',');
      result.push({ date, close: parseFloat(close) });
    }
    // Sort ascending by date
    result.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Filter by range (approximate year)
    if (range === '1y') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      return result.filter(({ date }) => new Date(date) >= oneYearAgo);
    }
    return result;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// GET /api/prices/:symbol?range=1y
app.get('/api/prices/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { range } = req.query;
  const prices = await fetchHistoricalPrices(symbol, range || '1y');
  res.json(prices);
});

// GET /api/portfolio/:id
app.get('/api/portfolio/:id', async (req, res) => {
  const { id } = req.params;
  const filePath = path.join(DATA_DIR, `portfolio_${id}.json`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    // If file not found, return empty object
    res.json({});
  }
});

// POST /api/portfolio/:id
app.post('/api/portfolio/:id', async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  const filePath = path.join(DATA_DIR, `portfolio_${id}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf8');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save portfolio' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
