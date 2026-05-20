import "server-only";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8050";

export async function fetchFromBackend(endpoint: string) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN environment variable is not set. Secure backend access is blocked.");
  }

  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Next.js data revalidation: revalidate every 60 seconds
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
  }

  return res.json();
}

export async function getSignals() {
  return fetchFromBackend("/api/v1/signals");
}

export async function getRegimes() {
  return fetchFromBackend("/api/v1/regimes");
}

export async function getPortfolio() {
  return fetchFromBackend("/api/v1/portfolio");
}
