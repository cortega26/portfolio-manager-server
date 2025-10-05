export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://portfolio-api.carlosortega77.workers.dev";

function buildPortfolioHeaders({ apiKey, newApiKey } = {}, baseHeaders = {}) {
  const headers = { ...baseHeaders };
  if (apiKey) {
    headers["X-Portfolio-Key"] = apiKey;
  }
  if (newApiKey) {
    headers["X-Portfolio-Key-New"] = newApiKey;
  }
  return headers;
}

export async function fetchPrices(symbol, range = "1y") {
  const response = await fetch(
    `${API_BASE}/api/prices/${symbol}?range=${range}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch prices for ${symbol}`);
  }

  return response.json();
}

export async function persistPortfolio(portfolioId, body, options = {}) {
  const response = await fetch(`${API_BASE}/api/portfolio/${portfolioId}`, {
    method: "POST",
    headers: buildPortfolioHeaders(options, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Unable to save portfolio ${portfolioId}`);
  }

  return response.json().catch(() => ({}));
}

export async function retrievePortfolio(portfolioId, options = {}) {
  const headers = buildPortfolioHeaders(options);
  const fetchOptions = Object.keys(headers).length > 0 ? { headers } : undefined;
  const response = await fetch(`${API_BASE}/api/portfolio/${portfolioId}`, fetchOptions);
  if (!response.ok) {
    throw new Error(`Unable to load portfolio ${portfolioId}`);
  }

  return response.json();
}
