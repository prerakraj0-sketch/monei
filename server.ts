import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const USER_AGENT = 'Mozilla/5.0';
const APP_ACCESS_PASSWORD = process.env.APP_ACCESS_PASSWORD || '1Namexyz@';
const APP_SESSION_SECRET =
  process.env.APP_SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(`${APP_ACCESS_PASSWORD}:meridian-session-v1`)
    .digest('hex');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const failedAuthAttempts = new Map<string, { count: number; resetAt: number }>();

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function verifyAppPassword(candidate: string): boolean {
  const expectedDigest = sha256Buffer(APP_ACCESS_PASSWORD);
  const candidateDigest = sha256Buffer(candidate);
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
}

function createAppSessionToken(): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ iat: issuedAt, exp: expiresAt }), 'utf8').toString(
    'base64url',
  );
  const signature = crypto
    .createHmac('sha256', APP_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt };
}

function verifyAppSessionToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expectedSig = crypto
    .createHmac('sha256', APP_SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

interface QuoteEntry {
  symbol: string;
  shortName: string;
  currency: string;
  exchangeName: string;
  marketState: string;
  regularMarketPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  regularMarketTime: number;
  sparkline: number[];
  fxRateToTarget: number;
  fetchedAt: number;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}

const quoteCache = new Map<string, { data: Omit<QuoteEntry, 'fxRateToTarget'>; expiresAt: number }>();
const sparkCache = new Map<string, { points: number[]; expiresAt: number }>();
const fxCache = new Map<string, { rate: number; expiresAt: number }>();

async function fetchGrowwSparkline(exchange: 'NSE' | 'BSE', scripCode: string): Promise<number[]> {
  const cacheKey = `GROWW:${exchange}:${scripCode}`;
  const now = Date.now();
  const cached = sparkCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.points;
  }

  try {
    const url = `https://groww.in/v1/api/charting_service/v2/chart/exchange/${exchange}/segment/CASH/${encodeURIComponent(scripCode)}/daily?intervalInMinutes=5&minimal=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return cached ? cached.points : [];
    const data = (await res.json()) as { candles?: Array<[number, number]> };
    const points = (data.candles ?? [])
      .map((c) => c[1])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .slice(-28);
    if (points.length > 0) {
      sparkCache.set(cacheKey, { points, expiresAt: now + 60000 });
    }
    return points;
  } catch {
    return cached ? cached.points : [];
  }
}

async function fetchGrowwQuote(rawSymbol: string): Promise<Omit<QuoteEntry, 'fxRateToTarget'> | null> {
  const clean = rawSymbol.trim().toUpperCase();
  if (!clean) return null;

  // Skip obvious non-Indian Yahoo symbols (US / Crypto / FX)
  if (clean.includes('=') || clean.includes('-USD') || (clean.includes('.') && !clean.endsWith('.NS') && !clean.endsWith('.BO'))) {
    return null;
  }

  const now = Date.now();
  const cached = quoteCache.get(`GROWW:${clean}`);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  let preferredExchange: 'NSE' | 'BSE' = 'NSE';
  let scripCode = clean;
  if (clean.endsWith('.NS')) {
    preferredExchange = 'NSE';
    scripCode = clean.slice(0, -3);
  } else if (clean.endsWith('.BO')) {
    preferredExchange = 'BSE';
    scripCode = clean.slice(0, -3);
  }

  const exchangesToTry: Array<'NSE' | 'BSE'> =
    preferredExchange === 'BSE' ? ['BSE', 'NSE'] : ['NSE', 'BSE'];

  for (const exchange of exchangesToTry) {
    try {
      const liveUrl = `https://groww.in/v1/api/stocks_data/v1/tr_live_prices/exchange/${exchange}/segment/CASH/${encodeURIComponent(scripCode)}/latest`;
      const response = await fetch(liveUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as {
        symbol?: string;
        ltp?: number;
        close?: number;
        dayChange?: number;
        dayChangePerc?: number;
        lastTradeTime?: number;
        tsInMillis?: number;
      };

      if (typeof payload.ltp !== 'number' || !Number.isFinite(payload.ltp) || payload.ltp <= 0) {
        continue;
      }

      const ltp = payload.ltp;
      const previousClose =
        typeof payload.close === 'number' && payload.close > 0 ? payload.close : ltp;
      const dayChange =
        typeof payload.dayChange === 'number' ? payload.dayChange : ltp - previousClose;
      const dayChangePercent =
        typeof payload.dayChangePerc === 'number'
          ? payload.dayChangePerc
          : previousClose > 0
            ? (dayChange / previousClose) * 100
            : 0;

      const sparkline = await fetchGrowwSparkline(exchange, scripCode);
      if (sparkline.length === 0) {
        sparkline.push(previousClose, ltp);
      }

      const entry: Omit<QuoteEntry, 'fxRateToTarget'> = {
        symbol: clean,
        shortName: payload.symbol || scripCode,
        currency: 'INR',
        exchangeName: `Groww · ${exchange}`,
        marketState: 'REGULAR',
        regularMarketPrice: ltp,
        previousClose,
        dayChange,
        dayChangePercent,
        regularMarketTime: payload.lastTradeTime || Math.floor((payload.tsInMillis || now) / 1000),
        sparkline,
        fetchedAt: now,
      };

      quoteCache.set(`GROWW:${clean}`, { data: entry, expiresAt: now + 5000 });
      return entry;
    } catch {
      // Try next exchange or fallback
    }
  }

  return cached ? cached.data : null;
}

async function fetchYahooChartQuote(symbol: string): Promise<Omit<QuoteEntry, 'fxRateToTarget'> | null> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (!cleanSymbol) return null;

  const now = Date.now();
  const cached = quoteCache.get(`YF:${cleanSymbol}`);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=5m&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=5m&range=1d`,
  ];
  try {
    let response: Response | null = null;
    for (const url of urls) {
      const attempt = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (attempt.ok) {
        response = attempt;
        break;
      }
    }

    if (!response) {
      return cached ? cached.data : null;
    }

    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            symbol?: string;
            shortName?: string;
            longName?: string;
            currency?: string;
            fullExchangeName?: string;
            exchangeName?: string;
            marketState?: string;
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            regularMarketTime?: number;
          };
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const result = payload.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      return cached ? cached.data : null;
    }

    const regularMarketPrice = meta.regularMarketPrice;
    const previousClose =
      typeof meta.chartPreviousClose === 'number'
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number'
          ? meta.previousClose
          : regularMarketPrice;

    const dayChange = regularMarketPrice - previousClose;
    const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;

    const rawCloses = result?.indicators?.quote?.[0]?.close ?? [];
    const sparkline = rawCloses
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .slice(-24);

    if (sparkline.length === 0) {
      sparkline.push(previousClose, regularMarketPrice);
    }

    const entry: Omit<QuoteEntry, 'fxRateToTarget'> = {
      symbol: (meta.symbol || cleanSymbol).toUpperCase(),
      shortName: meta.shortName || meta.longName || cleanSymbol,
      currency: (meta.currency || 'USD').toUpperCase(),
      exchangeName: meta.fullExchangeName || meta.exchangeName || 'Market',
      marketState: meta.marketState || 'REGULAR',
      regularMarketPrice,
      previousClose,
      dayChange,
      dayChangePercent,
      regularMarketTime: meta.regularMarketTime || Math.floor(now / 1000),
      sparkline,
      fetchedAt: now,
    };

    quoteCache.set(`YF:${cleanSymbol}`, { data: entry, expiresAt: now + 5000 });
    return entry;
  } catch {
    return cached ? cached.data : null;
  }
}

async function fetchQuoteWithGrowwPriority(symbol: string): Promise<Omit<QuoteEntry, 'fxRateToTarget'> | null> {
  const growwQuote = await fetchGrowwQuote(symbol);
  if (growwQuote) return growwQuote;
  return fetchYahooChartQuote(symbol);
}

async function fetchFxRate(fromCurrency: string, toCurrency: string): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;

  const pairKey = `${from}${to}=X`;
  const now = Date.now();
  const cached = fxCache.get(pairKey);
  if (cached && cached.expiresAt > now) {
    return cached.rate;
  }

  const direct = await fetchYahooChartQuote(pairKey);
  if (direct && direct.regularMarketPrice > 0) {
    fxCache.set(pairKey, { rate: direct.regularMarketPrice, expiresAt: now + 60000 });
    return direct.regularMarketPrice;
  }

  const inverseKey = `${to}${from}=X`;
  const inverse = await fetchYahooChartQuote(inverseKey);
  if (inverse && inverse.regularMarketPrice > 0) {
    const rate = 1 / inverse.regularMarketPrice;
    fxCache.set(pairKey, { rate, expiresAt: now + 60000 });
    return rate;
  }

  return 1;
}

async function searchGrowwStocks(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://groww.in/v1/api/search/v3/query/global/st_p_query?page=0&query=${encodeURIComponent(query)}&size=8&web=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];

    const payload = (await res.json()) as {
      data?: {
        content?: Array<{
          title?: string;
          company_short_name?: string;
          nse_scrip_code?: string | null;
          bse_scrip_code?: string | null;
          entity_type?: string | null;
        }>;
      };
    };

    const results: SearchResult[] = [];
    for (const item of payload.data?.content ?? []) {
      const nse = item.nse_scrip_code?.trim().toUpperCase();
      const bse = item.bse_scrip_code?.trim().toUpperCase();
      const symbol = nse || (bse ? `${bse}.BO` : '');
      if (!symbol || !/^[A-Z0-9.\-=]{1,20}$/.test(symbol)) continue;

      results.push({
        symbol,
        name: item.title || item.company_short_name || symbol,
        exchange: nse ? 'Groww · NSE' : 'Groww · BSE',
        quoteType: item.entity_type || 'Stocks',
      });
    }
    return results.slice(0, 6);
  } catch {
    return [];
  }
}

async function searchYahooStocks(query: string): Promise<SearchResult[]> {
  try {
    const searchUrls = [
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`,
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=6&newsCount=0`,
    ];
    let response: Response | null = null;
    for (const url of searchUrls) {
      const attempt = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(4500),
      });
      if (attempt.ok) {
        response = attempt;
        break;
      }
    }
    if (!response) return [];

    const payload = (await response.json()) as {
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchDisp?: string;
        typeDisp?: string;
      }>;
    };

    const allowedTypes = new Set(['EQUITY', 'ETF', 'CRYPTOCURRENCY', 'MUTUALFUND', 'INDEX']);
    return (payload.quotes ?? [])
      .filter(
        (item) =>
          item.symbol &&
          (!item.typeDisp ||
            allowedTypes.has(item.typeDisp.toUpperCase()) ||
            item.typeDisp === 'Equity' ||
            item.typeDisp === 'ETF' ||
            item.typeDisp === 'Cryptocurrency'),
      )
      .slice(0, 5)
      .map((item) => ({
        symbol: String(item.symbol).toUpperCase(),
        name: item.shortname || item.longname || String(item.symbol),
        exchange: item.exchDisp || 'Global',
        quoteType: item.typeDisp || 'Equity',
      }));
  } catch {
    return [];
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, provider: 'groww', timestamp: Date.now() });
  });

  app.post('/api/auth/verify-passcode', (req, res) => {
    const clientIp = req.ip || 'unknown';
    const now = Date.now();
    const record = failedAuthAttempts.get(clientIp);
    if (record && record.resetAt > now && record.count >= 10) {
      res.status(429).json({
        ok: false,
        error: 'Too many incorrect attempts. Please wait a minute and try again.',
      });
      return;
    }

    const submitted = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!submitted) {
      res.status(400).json({
        ok: false,
        error: 'Please enter the password to open the app.',
      });
      return;
    }

    if (!verifyAppPassword(submitted)) {
      const nextCount = record && record.resetAt > now ? record.count + 1 : 1;
      const nextReset = record && record.resetAt > now ? record.resetAt : now + 60_000;
      failedAuthAttempts.set(clientIp, { count: nextCount, resetAt: nextReset });
      res.status(401).json({
        ok: false,
        error: 'Incorrect password. Please try again.',
      });
      return;
    }

    failedAuthAttempts.delete(clientIp);
    const { token, expiresAt } = createAppSessionToken();
    res.json({ ok: true, token, expiresAt });
  });

  app.get('/api/auth/session', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token || !verifyAppSessionToken(token)) {
      res.status(401).json({ valid: false });
      return;
    }
    res.json({ valid: true });
  });

  app.get('/api/stocks/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 1) {
      res.json({ results: [] });
      return;
    }

    const [growwResults, yahooResults] = await Promise.all([
      searchGrowwStocks(query),
      searchYahooStocks(query),
    ]);

    const seen = new Set<string>();
    const combined: SearchResult[] = [];
    for (const item of [...growwResults, ...yahooResults]) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        combined.push(item);
      }
    }

    res.json({ results: combined.slice(0, 8) });
  });

  app.get('/api/stocks/quotes', async (req, res) => {
    const rawSymbols = String(req.query.symbols || '').trim();
    const targetCurrency = String(req.query.currency || 'INR').trim().toUpperCase();

    if (!rawSymbols) {
      res.json({ quotes: {}, targetCurrency, fetchedAt: Date.now() });
      return;
    }

    const symbols = Array.from(
      new Set(
        rawSymbols
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z0-9.\-=]{1,20}$/.test(s)),
      ),
    ).slice(0, 40);

    const quoteResults = await Promise.all(
      symbols.map((sym) => fetchQuoteWithGrowwPriority(sym)),
    );

    const uniqueCurrencies = Array.from(
      new Set(
        quoteResults
          .filter((q): q is Omit<QuoteEntry, 'fxRateToTarget'> => q !== null)
          .map((q) => q.currency),
      ),
    );

    const fxEntries = await Promise.all(
      uniqueCurrencies.map(
        async (curr) => [curr, await fetchFxRate(curr, targetCurrency)] as const,
      ),
    );
    const fxMap = Object.fromEntries(fxEntries);

    const quotes: Record<string, QuoteEntry> = {};
    for (const q of quoteResults) {
      if (q) {
        quotes[q.symbol] = {
          ...q,
          fxRateToTarget: fxMap[q.currency] ?? 1,
        };
      }
    }

    res.json({
      quotes,
      targetCurrency,
      fetchedAt: Date.now(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Ledger server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
