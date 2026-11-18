import React, { useState } from 'react';
import { FileText, Lock, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  CurrencyCode,
  DealPriority,
  DealStage,
  ImportantDeal,
} from '../types';
import { clampString, DEAL_STAGE_LABELS, formatMoney } from '../lib/formatters';

interface DealsColumnProps {
  deals: ImportantDeal[];
  preferredCurrency: CurrencyCode;
  loading: boolean;
  onAddDeal: (input: {
    title: string;
    counterparty: string;
    dealValue: number;
    stage: DealStage;
    priority: DealPriority;
    targetDate: string;
    notes: string;
  }) => Promise<void>;
  onUpdateDeal: (
    deal: ImportantDeal,
    updates: {
      title: string;
      counterparty: string;
      dealValue: number;
      stage: DealStage;
      priority: DealPriority;
      targetDate: string;
      notes: string;
    },
  ) => Promise<void>;
  onChangeStage: (deal: ImportantDeal, nextStage: DealStage) => Promise<void>;
  onDeleteDeal: (dealId: string) => Promise<void>;
  onCreateAgreementFromDeal?: (deal: ImportantDeal) => void;
}

export function DealsColumn({
  deals,
  preferredCurrency,
  loading,
  onAddDeal,
  onUpdateDeal,
  onChangeStage,
  onDeleteDeal,
  onCreateAgreementFromDeal,
}: DealsColumnProps) {
  const [stageFilter, setStageFilter] = useState<'all' | 'open' | DealStage>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<ImportantDeal | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [stage, setStage] = useState<DealStage>(DealStage.ACTIVE);
  const [priority, setPriority] = useState<DealPriority>(DealPriority.HIGH);
  const [targetDate, setTargetDate] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setEditingDeal(null);
    setTitle('');
    setCounterparty('');
    setDealValue('');
    setStage(DealStage.ACTIVE);
    setPriority(DealPriority.HIGH);
    setTargetDate('');
    setNotes('');
    setFormError(null);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (deal: ImportantDeal) => {
    if (deal.stage === DealStage.CLOSED) return;
    setEditingDeal(deal);
    setTitle(deal.title);
    setCounterparty(deal.counterparty);
    setDealValue(String(deal.dealValue));
    setStage(deal.stage);
    setPriority(deal.priority);
    setTargetDate(deal.targetDate);
    setNotes(deal.notes);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = clampString(title, BLUEPRINT_LIMITS.DEAL_TITLE_MAX);
    const cleanCounterparty = clampString(counterparty, BLUEPRINT_LIMITS.DEAL_COUNTERPARTY_MAX);
    const numValue = dealValue.trim() === '' ? 0 : Number(dealValue);
    const cleanTargetDate = clampString(targetDate, BLUEPRINT_LIMITS.DEAL_TARGET_DATE_MAX);
    const cleanNotes = clampString(notes, BLUEPRINT_LIMITS.DEAL_NOTES_MAX);

    if (!cleanTitle) {
      setFormError('Deal title is required.');
      return;
    }
    if (!Number.isFinite(numValue) || numValue < 0) {
      setFormError('Deal value must be 0 or greater.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingDeal) {
        await onUpdateDeal(editingDeal, {
          title: cleanTitle,
          counterparty: cleanCounterparty,
          dealValue: numValue,
          stage,
          priority,
          targetDate: cleanTargetDate,
          notes: cleanNotes,
        });
      } else {
        await onAddDeal({
          title: cleanTitle,
          counterparty: cleanCounterparty,
          dealValue: numValue,
          stage,
          priority,
          targetDate: cleanTargetDate,
          notes: cleanNotes,
        });
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save deal.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDeals = deals.filter((d) => d.stage !== DealStage.CLOSED);
  const openDealsTotal = openDeals.reduce((sum, d) => sum + d.dealValue, 0);

  const visibleDeals = deals.filter((d) => {
    if (stageFilter === 'open' && d.stage === DealStage.CLOSED) return false;
    if (stageFilter !== 'all' && stageFilter !== 'open' && d.stage !== stageFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) ||
      d.counterparty.toLowerCase().includes(q) ||
      d.notes.toLowerCase().includes(q)
    );
  });

  return (
    <section
      aria-label="Important Deals Vault"
      className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[540px]"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-200 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Important Deals</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active pipeline · {openDeals.length} open
            </p>
          </div>
          <button
            type="button"
            onClick={showForm ? () => { setShowForm(false); resetForm(); } : openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? 'Close' : 'Add Deal'}
          </button>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <div>
            <div className="text-xs text-slate-500">Active Deal Value</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatMoney(openDealsTotal, preferredCurrency)}
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            Total tracked: <span className="font-mono font-semibold text-slate-800">{deals.length}</span>
          </div>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            [
              ['all', 'All'],
              ['open', 'Open'],
              [DealStage.NEGOTIATING, 'Negotiating'],
              [DealStage.CLOSING, 'Closing'],
              [DealStage.CLOSED, 'Closed'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStageFilter(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                stageFilter === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Add / Edit Deal Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 bg-slate-50 border-b border-slate-200 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {editingDeal ? 'Edit Deal' : 'Store Important Deal'}
          </h3>

          <div>
            <label htmlFor="deal-title" className="block text-xs font-medium text-slate-700 mb-1">
              Deal Title
            </label>
            <input
              id="deal-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.DEAL_TITLE_MAX}
              placeholder="Commercial lease, angel allocation, supplier contract..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="deal-party" className="block text-xs font-medium text-slate-700 mb-1">
                Counterparty / Contact
              </label>
              <input
                id="deal-party"
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.DEAL_COUNTERPARTY_MAX}
                placeholder="Partner or Firm"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="deal-value" className="block text-xs font-medium text-slate-700 mb-1">
                Deal Value ({preferredCurrency})
              </label>
              <input
                id="deal-value"
                type="number"
                step="any"
                min="0"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="500000"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="deal-stage" className="block text-xs font-medium text-slate-700 mb-1">
                Stage
              </label>
              <select
                id="deal-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value as DealStage)}
                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Object.values(DealStage).map((s) => (
                  <option key={s} value={s}>
                    {DEAL_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="deal-priority" className="block text-xs font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                id="deal-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as DealPriority)}
                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value={DealPriority.HIGH}>High</option>
                <option value={DealPriority.NORMAL}>Normal</option>
              </select>
            </div>
            <div>
              <label htmlFor="deal-date" className="block text-xs font-medium text-slate-700 mb-1">
                Target Date
              </label>
              <input
                id="deal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="deal-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Key Terms &amp; Notes
            </label>
            <textarea
              id="deal-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={BLUEPRINT_LIMITS.DEAL_NOTES_MAX}
              placeholder="Valuation terms, closing checklist, or next step..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {stage === DealStage.CLOSED && (
            <p className="text-xs text-amber-700">
              Note: Marking a deal as Closed finalizes and locks its record against further edits.
            </p>
          )}

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingDeal ? 'Update Deal' : 'Save Deal'}
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      {deals.length > 3 && (
        <div className="px-5 py-2.5 border-b border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals, parties, or terms..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>
      )}

      {/* Deals List */}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-slate-100 rounded" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">No important deals stored</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Save contracts, private investments, negotiations, or high-value purchases with target dates and key terms.
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Store First Deal
            </button>
          </div>
        ) : visibleDeals.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No deals match the selected filter.</div>
        ) : (
          visibleDeals.map((deal) => {
            const isClosed = deal.stage === DealStage.CLOSED;
            return (
              <div key={deal.id} className="px-5 py-3.5 hover:bg-slate-50/70 transition-colors space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isClosed && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{deal.title}</h3>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                      {deal.priority === DealPriority.HIGH && (
                        <>
                          <span className="font-medium text-amber-700">High Priority</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span>{DEAL_STAGE_LABELS[deal.stage]}</span>
                      {deal.counterparty && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{deal.counterparty}</span>
                        </>
                      )}
                      {deal.targetDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{deal.targetDate}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-mono font-semibold tabular-nums text-slate-900 shrink-0">
                    {formatMoney(deal.dealValue, preferredCurrency)}
                  </div>
                </div>

                {deal.notes && (
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{deal.notes}</p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                  {!isClosed ? (
                    confirmCloseId === deal.id ? (
                      <div className="flex items-center gap-2 text-amber-700">
                        <span>Finalize &amp; lock?</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await onChangeStage(deal, DealStage.CLOSED);
                            setConfirmCloseId(null);
                          }}
                          className="font-semibold underline"
                        >
                          Lock Closed
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCloseId(null)}
                          className="text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        value={deal.stage}
                        aria-label={`Change stage for ${deal.title}`}
                        onChange={(e) => {
                          const next = e.target.value as DealStage;
                          if (next === DealStage.CLOSED) {
                            setConfirmCloseId(deal.id);
                          } else {
                            onChangeStage(deal, next);
                          }
                        }}
                        className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-slate-700 focus:outline-none"
                      >
                        {Object.values(DealStage).map((s) => (
                          <option key={s} value={s}>
                            {DEAL_STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    )
                  ) : (
                    <span className="text-slate-400">Finalized</span>
                  )}

                  <div className="flex items-center gap-2 text-slate-400">
                    {confirmDeleteId === deal.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onDeleteDeal(deal.id);
                            setConfirmDeleteId(null);
                          }}
                          className="text-red-600 font-medium"
                        >
                          Confirm Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        {onCreateAgreementFromDeal && (
                          <button
                            type="button"
                            onClick={() => onCreateAgreementFromDeal(deal)}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                            aria-label={`Generate agreement for ${deal.title}`}
                            title="Generate Money Agreement for this deal"
                          >
                            <FileText className="w-3 h-3" />
                            Agreement
                          </button>
                        )}
                        {!isClosed && (
                          <button
                            type="button"
                            onClick={() => openEdit(deal)}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                            aria-label={`Edit ${deal.title}`}
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(deal.id)}
                          className="inline-flex items-center gap-1 hover:text-red-600"
                          aria-label={`Remove ${deal.title}`}
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
