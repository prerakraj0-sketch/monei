import React, { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  CurrencyCode,
  LiveQuote,
  StockHolding,
  StockSearchResult,
} from '../types';
import {
  clampString,
  formatMoney,
  formatPercent,
  formatShares,
  formatSignedMoney,
  formatTimeAgo,
} from '../lib/formatters';
import { Sparkline } from './Sparkline';

interface StockColumnProps {
  holdings: StockHolding[];
  quotes: Record<string, LiveQuote>;
  preferredCurrency: CurrencyCode;
  loading: boolean;
  isFetchingQuotes: boolean;
  autoRefresh: boolean;
  lastQuoteSync: number | null;
  onToggleAutoRefresh: () => void;
  onRefreshQuotes: () => void;
  onAddStock: (input: {
    symbol: string;
    companyName: string;
    shares: number;
    avgBuyPrice: number;
    currency: string;
    notes: string;
  }) => Promise<void>;
  onUpdateStock: (
    stock: StockHolding,
    updates: {
      companyName: string;
      shares: number;
      avgBuyPrice: number;
      currency: string;
      notes: string;
    },
  ) => Promise<void>;
  onDeleteStock: (stockId: string) => Promise<void>;
}

export function StockColumn({
  holdings,
  quotes,
  preferredCurrency,
  loading,
  isFetchingQuotes,
  autoRefresh,
  lastQuoteSync,
  onToggleAutoRefresh,
  onRefreshQuotes,
  onAddStock,
  onUpdateStock,
  onDeleteStock,
}: StockColumnProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingStock, setEditingStock] = useState<StockHolding | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  // Form states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchingTicker, setSearchingTicker] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [shares, setShares] = useState('');
  const [avgBuyPrice, setAvgBuyPrice] = useState('');
  const [currency, setCurrency] = useState<string>(preferredCurrency);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!showForm || editingStock || q.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingTicker(true);
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = (await res.json()) as { results?: StockSearchResult[] };
          setSearchResults(data.results ?? []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingTicker(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, showForm, editingStock]);

  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSymbol('');
    setCompanyName('');
    setShares('');
    setAvgBuyPrice('');
    setCurrency(preferredCurrency);
    setNotes('');
    setFormError(null);
    setEditingStock(null);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (stock: StockHolding) => {
    setEditingStock(stock);
    setSymbol(stock.symbol);
    setCompanyName(stock.companyName);
    setShares(String(stock.shares));
    setAvgBuyPrice(String(stock.avgBuyPrice));
    setCurrency(stock.currency);
    setNotes(stock.notes);
    setFormError(null);
    setShowForm(true);
  };

  const handleSelectTicker = async (item: StockSearchResult) => {
    setSymbol(item.symbol);
    setCompanyName(item.name);
    setSearchQuery('');
    setSearchResults([]);
    try {
      const res = await fetch(
        `/api/stocks/quotes?symbols=${encodeURIComponent(item.symbol)}&currency=${encodeURIComponent(preferredCurrency)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { quotes?: Record<string, LiveQuote> };
        const q = data.quotes?.[item.symbol];
        if (q) {
          setCurrency(q.currency || preferredCurrency);
          if (!avgBuyPrice) {
            setAvgBuyPrice(q.regularMarketPrice.toFixed(2));
          }
        }
      }
    } catch {
      // Keep manual inputs
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanSymbol = symbol.trim().toUpperCase().slice(0, BLUEPRINT_LIMITS.SYMBOL_MAX);
    const cleanName = clampString(companyName || cleanSymbol, BLUEPRINT_LIMITS.COMPANY_NAME_MAX);
    const numShares = Number(shares);
    const numBuy = avgBuyPrice.trim() === '' ? 0 : Number(avgBuyPrice);
    const cleanCurr = (currency.trim().toUpperCase() || preferredCurrency).slice(0, BLUEPRINT_LIMITS.CURRENCY_MAX);
    const cleanNotes = clampString(notes, BLUEPRINT_LIMITS.STOCK_NOTES_MAX);

    if (!BLUEPRINT_LIMITS.SYMBOL_PATTERN.test(cleanSymbol)) {
      setFormError('Enter a valid ticker symbol (letters, numbers, ., -, =).');
      return;
    }
    if (!cleanName) {
      setFormError('Company name is required.');
      return;
    }
    if (!Number.isFinite(numShares) || numShares <= 0) {
      setFormError('Shares must be greater than 0.');
      return;
    }
    if (!Number.isFinite(numBuy) || numBuy < 0) {
      setFormError('Average buy price cannot be negative.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingStock) {
        await onUpdateStock(editingStock, {
          companyName: cleanName,
          shares: numShares,
          avgBuyPrice: numBuy,
          currency: cleanCurr,
          notes: cleanNotes,
        });
      } else {
        await onAddStock({
          symbol: cleanSymbol,
          companyName: cleanName,
          shares: numShares,
          avgBuyPrice: numBuy,
          currency: cleanCurr,
          notes: cleanNotes,
        });
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save holding.');
    } finally {
      setSubmitting(false);
    }
  };

  // Portfolio calculations in preferredCurrency
  let totalMarketValue = 0;
  let totalCostBasis = 0;
  let totalDayChange = 0;

  const enrichedHoldings = holdings.map((h) => {
    const quote = quotes[h.symbol];
    const fx = quote?.fxRateToTarget ?? 1;
    const livePriceNative = quote ? quote.regularMarketPrice : h.avgBuyPrice;
    const marketValueTarget = h.shares * livePriceNative * fx;
    const costBasisTarget = h.shares * h.avgBuyPrice * fx;
    const gainLossTarget = marketValueTarget - costBasisTarget;
    const gainLossPct = costBasisTarget > 0 ? (gainLossTarget / costBasisTarget) * 100 : 0;
    const dayChangeTarget = quote ? h.shares * quote.dayChange * fx : 0;

    totalMarketValue += marketValueTarget;
    totalCostBasis += costBasisTarget;
    totalDayChange += dayChangeTarget;

    return {
      holding: h,
      quote,
      livePriceNative,
      marketValueTarget,
      costBasisTarget,
      gainLossTarget,
      gainLossPct,
    };
  });

  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

  const visibleHoldings = enrichedHoldings.filter(({ holding }) => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      holding.symbol.toLowerCase().includes(q) ||
      holding.companyName.toLowerCase().includes(q)
    );
  });

  return (
    <section
      aria-label="Real-Time Stock Portfolio"
      className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[540px]"
    >
      {/* Column Header */}
      <div className="p-5 border-b border-slate-200 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Stock Portfolio</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Groww live quotes · Updated {formatTimeAgo(lastQuoteSync)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleAutoRefresh}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                autoRefresh
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Toggle 15-second live price updates"
            >
              {autoRefresh ? 'Live 15s On' : 'Live Paused'}
            </button>
            <button
              type="button"
              onClick={onRefreshQuotes}
              disabled={isFetchingQuotes}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-50"
              aria-label="Refresh stock prices"
              title="Refresh stock prices now"
            >
              <RefreshCw className={`w-4 h-4 ${isFetchingQuotes ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={showForm ? () => { setShowForm(false); resetForm(); } : openAddForm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showForm ? 'Close' : 'Add Stock'}
            </button>
          </div>
        </div>

        {/* Column Metric Summary */}
        <div className="grid grid-cols-3 gap-4 pt-1">
          <div>
            <div className="text-xs text-slate-500">Live Value</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatMoney(totalMarketValue, preferredCurrency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Total P&amp;L</div>
            <div
              className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
                totalGainLoss >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {formatSignedMoney(totalGainLoss, preferredCurrency)}{' '}
              <span className="text-xs font-normal">({formatPercent(totalGainLossPct)})</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Today</div>
            <div
              className={`text-sm font-semibold font-mono tabular-nums mt-1 ${
                totalDayChange >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {formatSignedMoney(totalDayChange, preferredCurrency)}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Stock Drawer */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {editingStock ? `Edit ${editingStock.symbol}` : 'Add Stock Holding'}
            </h3>
          </div>

          {!editingStock && (
            <div className="relative">
              <label htmlFor="ticker-search" className="block text-xs font-medium text-slate-700 mb-1">
                Search Company or Ticker
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="ticker-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search RELIANCE, TCS, HDFCBANK, ZOMATO..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              {(searchingTicker || searchResults.length > 0) && (
                <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-md max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {searchingTicker && (
                    <div className="px-3 py-2 text-xs text-slate-500">Searching market listings...</div>
                  )}
                  {!searchingTicker &&
                    searchResults.map((item) => (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => handleSelectTicker(item)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-mono font-semibold text-slate-900">{item.symbol}</span>
                          <span className="text-xs text-slate-600 ml-2 truncate">{item.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{item.exchange}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="stock-symbol" className="block text-xs font-medium text-slate-700 mb-1">
                Ticker Symbol
              </label>
              <input
                id="stock-symbol"
                type="text"
                required
                disabled={Boolean(editingStock)}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                maxLength={BLUEPRINT_LIMITS.SYMBOL_MAX}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="stock-name" className="block text-xs font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                id="stock-name"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Reliance Industries"
                maxLength={BLUEPRINT_LIMITS.COMPANY_NAME_MAX}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="stock-shares" className="block text-xs font-medium text-slate-700 mb-1">
                Shares Held
              </label>
              <input
                id="stock-shares"
                type="number"
                step="any"
                min="0.0001"
                required
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="10"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="stock-buy" className="block text-xs font-medium text-slate-700 mb-1">
                Avg Buy Price
              </label>
              <input
                id="stock-buy"
                type="number"
                step="any"
                min="0"
                value={avgBuyPrice}
                onChange={(e) => setAvgBuyPrice(e.target.value)}
                placeholder="1250.00"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="stock-currency" className="block text-xs font-medium text-slate-700 mb-1">
                Quote Currency
              </label>
              <input
                id="stock-currency"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={BLUEPRINT_LIMITS.CURRENCY_MAX}
                className="w-full px-3 py-2 text-sm font-mono uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="stock-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Position Notes (Optional)
            </label>
            <input
              id="stock-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.STOCK_NOTES_MAX}
              placeholder="Long-term core holding"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {formError && <p className="text-xs text-red-600 font-medium">{formError}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingStock ? 'Update Holding' : 'Save Holding'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      {holdings.length > 3 && (
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter holdings by ticker or name..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>
      )}

      {/* Holdings List */}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-4">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="animate-pulse flex items-center justify-between py-2">
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                  <div className="h-3 w-36 bg-slate-100 rounded" />
                </div>
                <div className="h-5 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : holdings.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">No stocks stored yet</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Add your stock tickers and share counts to track live market value, daily movement, and unrealized profit in real time.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First Stock
            </button>
          </div>
        ) : visibleHoldings.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No matching stocks found.</div>
        ) : (
          visibleHoldings.map(({ holding, quote, livePriceNative, marketValueTarget, gainLossTarget, gainLossPct }) => {
            const isDayUp = (quote?.dayChangePercent ?? 0) >= 0;
            const isTotalUp = gainLossTarget >= 0;
            const nativeCurrency = quote?.currency || holding.currency;

            return (
              <div key={holding.id} className="px-5 py-3.5 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-mono font-bold text-slate-900">{holding.symbol}</span>
                      <span className="text-xs text-slate-600 truncate">{holding.companyName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      <span>{formatShares(holding.shares)} sh</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Live {formatMoney(livePriceNative, nativeCurrency)}
                      </span>
                      {quote && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`inline-flex items-center gap-0.5 font-medium ${
                              isDayUp ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {isDayUp ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {formatPercent(quote.dayChangePercent)}
                          </span>
                        </>
                      )}
                    </div>
                    {holding.notes && (
                      <p className="text-xs text-slate-400 mt-1 truncate">{holding.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {quote?.sparkline && (
                      <div className="hidden sm:block">
                        <Sparkline points={quote.sparkline} positive={isDayUp} />
                      </div>
                    )}
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-semibold text-slate-900">
                        {formatMoney(marketValueTarget, preferredCurrency)}
                      </div>
                      <div
                        className={`text-xs ${
                          isTotalUp ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {formatSignedMoney(gainLossTarget, preferredCurrency)} ({formatPercent(gainLossPct)})
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row Actions */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100/80 text-xs text-slate-400">
                  <span className="font-mono tabular-nums">
                    Avg cost {formatMoney(holding.avgBuyPrice, holding.currency)}
                    {quote ? ` · ${quote.exchangeName}` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    {confirmDeleteId === holding.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteStock(holding.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-red-600 hover:text-red-700 font-medium"
                        >
                          Confirm Remove
                        </button>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(holding)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
                          aria-label={`Edit ${holding.symbol}`}
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(holding.id)}
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600"
                          aria-label={`Remove ${holding.symbol}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
