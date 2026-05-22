import "server-only";

// Hardcoded HF space URL to guarantee connection if Vercel env vars are missing
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "https://bhargav12321-andria-backend.hf.space";

export async function fetchFromBackend(endpoint: string) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN environment variable is not set on Vercel.");
  }

  // Clean the base URL to prevent double-slashes
  const baseUrl = BACKEND_URL.replace(/\/$/, "");
  const targetUrl = `${baseUrl}${endpoint}`;

  console.log(`[Vercel] Fetching from backend: ${targetUrl}`);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 0 }, // Disable cache temporarily for debugging
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Vercel] API Error (${res.status}):`, errText);
      throw new Error(`API Error ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error(`[Vercel] Network/Fetch Error targeting ${targetUrl}:`, error);
    throw error;
  }
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
