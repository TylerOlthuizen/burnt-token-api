import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = process.env.PORT || 3000;

const BURNT_TOKEN_ADDRESS = "burnt3JjFJvvAbKznwrDKxW5U9ZcsKUuCyJVCjKdSVB";
const MAX_SUPPLY = 999999999;
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const allowedDomains = ["https://burnt.fun"];

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again after 15 minutes.",
  },
});

// Apply rate limiter to all routes
app.use(limiter);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedDomains.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

// Cache to store the last successful price and market cap
let cache = {
  price: 0,
  marketCap: 0,
  lastUpdated: 0,
};

// Helper function to fetch market data from CoinGecko
async function fetchMarketData(): Promise<{
  price: number;
  marketCap: number;
}> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/burnt-fun"
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const data = await response.json();
    const price = data.market_data?.current_price?.usd || 0;
    const marketCap = data.market_data?.market_cap?.usd || 0;

    // Update cache if the data is valid
    if (price > 0 && marketCap > 0) {
      cache = {
        price,
        marketCap,
        lastUpdated: Date.now(),
      };
    }

    return { price, marketCap };
  } catch (error) {
    console.error("Error fetching market data:", error);

    // Use cached data as a fallback
    return { price: cache.price, marketCap: cache.marketCap };
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPrice(value: number): string {
  if (value >= 0.01) {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })}`;
  } else {
    return `$${value.toFixed(10)}`;
  }
}

app.get(
  "/get-burnt-token-data",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const rpcPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenSupply",
        params: [BURNT_TOKEN_ADDRESS],
      };

      const response = await fetch(SOLANA_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload),
      });

      const data = await response.json();

      if (data.error) {
        res.status(500).json({ error: data.error.message });
        return;
      }

      const circulatingSupply =
        parseFloat(data.result.value.amount) /
        Math.pow(10, data.result.value.decimals);

      const burntSupply = MAX_SUPPLY - circulatingSupply;

      const { price, marketCap } = await fetchMarketData();

      res.json({
        circulatingSupply: formatNumber(circulatingSupply),
        burntSupply: formatNumber(burntSupply),
        maxSupply: formatNumber(MAX_SUPPLY),
        price: formatPrice(price),
        marketCap: formatPrice(marketCap),
        lastUpdated: new Date(cache.lastUpdated).toISOString(),
      });
    } catch (error) {
      console.error("Error fetching Burnt Token data:", error);
      res.status(500).json({ error: "Failed to fetch Burnt Token data" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
