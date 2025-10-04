export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://portfolio-api.carlosortega77.workers.dev";

export async function fetchPrices(symbol, range = "1y") {
  const response = await fetch(
    `${API_BASE}/api/prices/${symbol}?range=${range}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch prices for ${symbol}`);
  }

  return response.json();
}

export async function persistPortfolio(portfolioId, body) {
  const response = await fetch(`${API_BASE}/api/portfolio/${portfolioId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Unable to save portfolio ${portfolioId}`);
  }

  return response.json().catch(() => ({}));
}

export async function retrievePortfolio(portfolioId) {
  const response = await fetch(`${API_BASE}/api/portfolio/${portfolioId}`);
  if (!response.ok) {
    throw new Error(`Unable to load portfolio ${portfolioId}`);
  }

  return response.json();
}
