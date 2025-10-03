import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

// Utility to format currency
const formatCurrency = (num) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

// Fetch prices from backend; returns array [{date, close}]
async function fetchPrices(symbol) {
  const res = await fetch(`/api/prices/${symbol}?range=1y`);
  const data = await res.json();
  return data;
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ date: '', ticker: '', type: 'BUY', amount: '', price: '' });
  const [signals, setSignals] = useState({});
  const [portfolioId, setPortfolioId] = useState('');
  const [roiData, setRoiData] = useState([]);
  const [loadingRoi, setLoadingRoi] = useState(false);

  // Derived holdings: group by ticker
  const holdings = useMemo(() => {
    const map = {};
    transactions.forEach(tx => {
      if (!map[tx.ticker]) {
        map[tx.ticker] = { shares: 0, cost: 0, realised: 0, ticker: tx.ticker };
      }
      const h = map[tx.ticker];
      if (tx.type === 'BUY') {
        h.shares += tx.shares;
        h.cost += Math.abs(tx.amount);
      } else if (tx.type === 'SELL') {
        // subtract shares; compute realised PnL using average cost
        const avgCost = h.shares ? h.cost / h.shares : 0;
        h.shares -= tx.shares; // tx.shares positive for sell
        h.cost -= avgCost * tx.shares;
        h.realised += tx.amount - avgCost * tx.shares;
      } else if (tx.type === 'DIVIDEND' || tx.type === 'DEPOSIT' || tx.type === 'WITHDRAW') {
        // dividends or deposits don't affect shares or cost
      }
    });
    return Object.values(map);
  }, [transactions]);

  // Compute current portfolio value and update holdings with price
  const [currentPrices, setCurrentPrices] = useState({});
  useEffect(() => {
    async function loadPrices() {
      const uniqueTickers = [...new Set(transactions.map((tx) => tx.ticker))];
      const newPrices = {};
      await Promise.all(uniqueTickers.map(async (ticker) => {
        const data = await fetchPrices(ticker);
        const latest = data[data.length - 1];
        if (latest) {
          newPrices[ticker] = latest.close;
        }
      }));
      setCurrentPrices(newPrices);
    }
    if (transactions.length) {
      loadPrices();
    }
  }, [transactions]);

  // Compute ROI vs SPY; create time series
  useEffect(() => {
    async function computeRoi() {
      setLoadingRoi(true);
      try {
        // Determine earliest date
        if (transactions.length === 0) {
          setRoiData([]);
          setLoadingRoi(false);
          return;
        }
        const tickers = [...new Set(transactions.map(tx => tx.ticker))];
        // Fetch price series for each ticker and SPY
        const priceMap = {};
        await Promise.all([...tickers, 'spy'].map(async sym => {
          const data = await fetchPrices(sym);
          priceMap[sym] = data;
        }));
        // Build a set of all dates present in SPY series (anchor)
        const spyPrices = priceMap['spy'];
        const dates = spyPrices.map(p => p.date);
        // Build holdings per date: for each date compute shares per ticker (cumulative) and value
        const roiSeries = [];
        const initialPortfolioValueDate = transactions.reduce((min, tx) => {
          const d = tx.date;
          return !min || d < min ? d : min;
        }, null);
        // Precompute cumulative shares per ticker over time
        const cumulative = {};
        tickers.forEach(t => cumulative[t] = 0);
        let initialValue = null;
        for (const date of dates) {
          // update cumulative shares based on transactions on this date
          transactions
            .filter(tx => tx.date === date)
            .forEach(tx => {
              if (tx.type === 'BUY') {
                cumulative[tx.ticker] += tx.shares;
              } else if (tx.type === 'SELL') {
                cumulative[tx.ticker] -= tx.shares;
              }
            });
          // compute portfolio value
          let portValue = 0;
          for (const t of tickers) {
            // find price for this ticker on this date (fallback to previous close if missing)
            const pSeries = priceMap[t];
            let price = 0;
            // find exact match or closest previous date
            for (let i = 0; i < pSeries.length; i++) {
              if (pSeries[i].date === date) {
                price = pSeries[i].close;
                break;
              }
              if (pSeries[i].date > date) {
                price = pSeries[i > 0 ? i - 1 : i].close;
                break;
              }
            }
            portValue += cumulative[t] * price;
          }
          // compute ROI: (value - initial)/initial
          if (initialValue === null) {
            initialValue = portValue;
          }
          const portfolioRoi = initialValue === 0 ? 0 : ((portValue - initialValue) / initialValue) * 100;
          // compute SPY ROI relative to initial SPY price
          const spyPrice = spyPrices.find(p => p.date === date)?.close || spyPrices[0].close;
          const initialSpyPrice = spyPrices[0].close;
          const spyRoi = ((spyPrice - initialSpyPrice) / initialSpyPrice) * 100;
          roiSeries.push({ date, portfolio: portfolioRoi, spy: spyRoi });
        }
        setRoiData(roiSeries);
      } catch (err) {
        console.error(err);
      }
      setLoadingRoi(false);
    }
    // recompute ROI when transactions change
    computeRoi();
  }, [transactions]);

  // Handle form input changes
  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Add transaction
  const addTransaction = (e) => {
    e.preventDefault();
    const { date, ticker, type, amount, price } = form;
    if (!date || !ticker || !type || !amount || !price) return;
    const amt = parseFloat(amount);
    const prc = parseFloat(price);
    const shares = Math.abs(amt) / prc;
    const tx = {
      date,
      ticker: ticker.trim().toUpperCase(),
      type,
      amount: type === 'BUY' ? -Math.abs(amt) : Math.abs(amt),
      price: prc,
      shares,
    };
    setTransactions((prev) => [...prev, tx]);
    setForm({ date: '', ticker: '', type: 'BUY', amount: '', price: '' });
  };

  // Save portfolio to server
  const savePortfolio = async () => {
    if (!portfolioId) return;
    const body = {
      transactions,
      signals,
    };
    await fetch(`/api/portfolio/${portfolioId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    alert('Portfolio saved!');
  };

  // Load portfolio
  const loadPortfolio = async () => {
    if (!portfolioId) return;
    const res = await fetch(`/api/portfolio/${portfolioId}`);
    const data = await res.json();
    if (data.transactions) setTransactions(data.transactions);
    if (data.signals) setSignals(data.signals);
  };

  // Update signal config for ticker
  const updateSignal = (ticker, pct) => {
    setSignals((prev) => ({ ...prev, [ticker]: { pct: parseFloat(pct) } }));
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Portfolio Manager</h1>
      {/* Portfolio ID and Save/Load */}
      <div className="flex gap-2 mb-4 items-end">
        <div className="flex flex-col">
          <label htmlFor="portfolioId" className="text-sm mb-1">
            Portfolio ID
          </label>
          <input
            id="portfolioId"
            type="text"
            className="border px-2 py-1 rounded w-40 dark:bg-gray-800 dark:border-gray-600"
            value={portfolioId}
            onChange={(e) => setPortfolioId(e.target.value)}
          />
        </div>
        <button
          onClick={savePortfolio}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
        >
          Save
        </button>
        <button
          onClick={loadPortfolio}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
        >
          Load
        </button>
      </div>

      {/* Transaction Form */}
      <form onSubmit={addTransaction} className="bg-white dark:bg-gray-800 shadow-md rounded p-4 mb-6">
        <h2 className="text-xl font-semibold mb-2">Add Transaction</h2>
        <div className="grid grid-cols-6 gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-sm mb-1">Date</label>
            <input
              type="date"
              className="border px-2 py-1 rounded dark:bg-gray-700 dark:border-gray-600"
              value={form.date}
              onChange={(e) => updateForm('date', e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">Ticker</label>
            <input
              type="text"
              className="border px-2 py-1 rounded dark:bg-gray-700 dark:border-gray-600"
              value={form.ticker}
              onChange={(e) => updateForm('ticker', e.target.value)}
              placeholder="e.g. AAPL"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">Type</label>
            <select
              className="border px-2 py-1 rounded dark:bg-gray-700 dark:border-gray-600"
              value={form.type}
              onChange={(e) => updateForm('type', e.target.value)}
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
              <option value="DEPOSIT">DEPOSIT</option>
              <option value="WITHDRAW">WITHDRAW</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              className="border px-2 py-1 rounded dark:bg-gray-700 dark:border-gray-600"
              value={form.amount}
              onChange={(e) => updateForm('amount', e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm mb-1">Price (USD)</label>
            <input
              type="number"
              step="0.01"
              className="border px-2 py-1 rounded dark:bg-gray-700 dark:border-gray-600"
              value={form.price}
              onChange={(e) => updateForm('price', e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm mb-1">Shares</span>
            <span className="font-mono">
              {form.amount && form.price ? (Math.abs(parseFloat(form.amount)) / parseFloat(form.price)).toFixed(4) : '—'}
            </span>
          </div>
        </div>
        <button
          type="submit"
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
        >
          Add
        </button>
      </form>

      {/* Holdings */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded p-4 mb-6">
        <h2 className="text-xl font-semibold mb-2">Holdings</h2>
        {holdings.length === 0 ? (
          <p>No holdings yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-600 text-left">
                <th className="py-1">Ticker</th>
                <th className="py-1">Shares</th>
                <th className="py-1">Avg Cost</th>
                <th className="py-1">Current Price</th>
                <th className="py-1">Value</th>
                <th className="py-1">Unrealised PnL</th>
                <th className="py-1">Realised PnL</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const price = currentPrices[h.ticker] ?? 0;
                const avgCost = h.shares !== 0 ? h.cost / h.shares : 0;
                const value = h.shares * price;
                const unreal = value - h.cost;
                return (
                  <tr key={h.ticker} className="border-b dark:border-gray-700">
                    <td className="py-1">{h.ticker}</td>
                    <td className="py-1">{h.shares.toFixed(4)}</td>
                    <td className="py-1">{formatCurrency(avgCost)}</td>
                    <td className="py-1">{price ? formatCurrency(price) : '—'}</td>
                    <td className="py-1">{formatCurrency(value)}</td>
                    <td className="py-1">{formatCurrency(unreal)}</td>
                    <td className="py-1">{formatCurrency(h.realised)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Signals */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded p-4 mb-6">
        <h2 className="text-xl font-semibold mb-2">Signals</h2>
        {holdings.length === 0 ? (
          <p>Add transactions to configure signals.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-600 text-left">
                <th className="py-1">Ticker</th>
                <th className="py-1">Pct Window (%)</th>
                <th className="py-1">Last Price</th>
                <th className="py-1">Buy Zone</th>
                <th className="py-1">Upper Zone</th>
                <th className="py-1">Signal</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const price = currentPrices[h.ticker] ?? 0;
                const pct = signals[h.ticker]?.pct ?? 3;
                const lower = price * (1 - pct / 100);
                const upper = price * (1 + pct / 100);
                let signal;
                if (price < lower) signal = 'BUY zone';
                else if (price > upper) signal = 'TRIM zone';
                else signal = 'HOLD';
                return (
                  <tr key={h.ticker} className="border-b dark:border-gray-700">
                    <td className="py-1">{h.ticker}</td>
                    <td className="py-1">
                      <input
                        type="number"
                        step="0.1"
                        className="border px-1 py-0.5 w-16 rounded dark:bg-gray-700 dark:border-gray-600"
                        value={pct}
                        onChange={(e) => updateSignal(h.ticker, e.target.value)}
                      />
                    </td>
                    <td className="py-1">{price ? formatCurrency(price) : '—'}</td>
                    <td className="py-1">{price ? formatCurrency(lower) : '—'}</td>
                    <td className="py-1">{price ? formatCurrency(upper) : '—'}</td>
                    <td className="py-1">
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-xs font-semibold',
                          signal === 'BUY zone' && 'bg-green-600 text-white',
                          signal === 'TRIM zone' && 'bg-red-600 text-white',
                          signal === 'HOLD' && 'bg-yellow-500 text-white'
                        )}
                      >
                        {signal}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ROI Chart */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded p-4 mb-6">
        <h2 className="text-xl font-semibold mb-2">ROI vs SPY</h2>
        {loadingRoi ? (
          <p>Loading chart…</p>
        ) : roiData.length === 0 ? (
          <p>No data to display.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={roiData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `${val.toFixed(1)}%`} />
              <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" name="Portfolio ROI" stroke="#10b981" dot={false} />
              <Line type="monotone" dataKey="spy" name="SPY %" stroke="#6366f1" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
