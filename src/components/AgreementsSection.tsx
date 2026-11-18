import React, { useEffect, useState } from 'react';
import {
  FileCheck2,
  FileDown,
  Lock,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  AgreementRuleId,
  AgreementStatus,
  AgreementType,
  BLUEPRINT_LIMITS,
  CurrencyCode,
  MoneyAgreement,
  PaymentMode,
  RepaymentTerms,
} from '../types';
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  clampString,
  formatMoney,
  getTodayDateString,
  numberToMoneyWords,
  PAYMENT_MODE_LABELS,
  REPAYMENT_TERMS_LABELS,
} from '../lib/formatters';
import { exportAgreementPdf } from '../lib/exporters';
import { AGREEMENT_RULE_CATALOG } from './PrintableAgreement';
import { SignaturePad } from './SignaturePad';

export interface AgreementDraftPrefill {
  agreementType?: AgreementType;
  receiverName?: string;
  amount?: number;
  dueDate?: string;
  purposeAndClauses?: string;
}

const DEFAULT_SELECTED_RULES: AgreementRuleId[] = [
  AgreementRuleId.NO_SETOFF,
  AgreementRuleId.GRACE_NOTICE,
  AgreementRuleId.LEGAL_RECOVERY_COSTS,
];

interface AgreementsSectionProps {
  agreements: MoneyAgreement[];
  defaultLenderName: string;
  preferredCurrency: CurrencyCode;
  loading: boolean;
  prefillDraft: AgreementDraftPrefill | null;
  onClearPrefill: () => void;
  onPrintAgreement: (agreement: MoneyAgreement) => void;
  onAddAgreement: (input: {
    agreementType: AgreementType;
    lenderName: string;
    receiverName: string;
    receiverDetails: string;
    amount: number;
    paymentMode: PaymentMode;
    paymentReference: string;
    agreementDate: string;
    dueDate: string;
    interestRate: number;
    repaymentTerms: RepaymentTerms;
    jurisdiction: string;
    purposeAndClauses: string;
    doublePenaltyOnDefault: boolean;
    selectedRules: string[];
    lenderSignature: string;
    receiverSignature: string;
    status: AgreementStatus;
  }) => Promise<MoneyAgreement | void>;
  onUpdateAgreement: (
    agreement: MoneyAgreement,
    updates: {
      agreementType: AgreementType;
      lenderName: string;
      receiverName: string;
      receiverDetails: string;
      amount: number;
      paymentMode: PaymentMode;
      paymentReference: string;
      agreementDate: string;
      dueDate: string;
      interestRate: number;
      repaymentTerms: RepaymentTerms;
      jurisdiction: string;
      purposeAndClauses: string;
      doublePenaltyOnDefault: boolean;
      selectedRules: string[];
      lenderSignature: string;
      receiverSignature: string;
      status: AgreementStatus;
    },
  ) => Promise<void>;
  onChangeStatus: (agreement: MoneyAgreement, nextStatus: AgreementStatus) => Promise<void>;
  onDeleteAgreement: (agreementId: string) => Promise<void>;
}

export function AgreementsSection({
  agreements,
  defaultLenderName,
  preferredCurrency,
  loading,
  prefillDraft,
  onClearPrefill,
  onPrintAgreement,
  onAddAgreement,
  onUpdateAgreement,
  onChangeStatus,
  onDeleteAgreement,
}: AgreementsSectionProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<MoneyAgreement | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | AgreementStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmSettleId, setConfirmSettleId] = useState<string | null>(null);

  // Form states
  const [agreementType, setAgreementType] = useState<AgreementType>(AgreementType.PERSONAL_LOAN);
  const [lenderName, setLenderName] = useState(defaultLenderName);
  const [receiverName, setReceiverName] = useState('');
  const [receiverDetails, setReceiverDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(PaymentMode.UPI);
  const [paymentReference, setPaymentReference] = useState('');
  const [agreementDate, setAgreementDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [repaymentTerms, setRepaymentTerms] = useState<RepaymentTerms>(RepaymentTerms.LUMP_SUM);
  const [jurisdiction, setJurisdiction] = useState('');
  const [purposeAndClauses, setPurposeAndClauses] = useState('');
  const [doublePenaltyOnDefault, setDoublePenaltyOnDefault] = useState(true);
  const [selectedRules, setSelectedRules] = useState<string[]>(DEFAULT_SELECTED_RULES);
  const [lenderSignature, setLenderSignature] = useState('');
  const [receiverSignature, setReceiverSignature] = useState('');
  const [status, setStatus] = useState<AgreementStatus>(AgreementStatus.ACTIVE);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setEditingAgreement(null);
    setAgreementType(AgreementType.PERSONAL_LOAN);
    setLenderName(defaultLenderName);
    setReceiverName('');
    setReceiverDetails('');
    setAmount('');
    setPaymentMode(PaymentMode.UPI);
    setPaymentReference('');
    setAgreementDate(getTodayDateString());
    setDueDate('');
    setInterestRate('0');
    setRepaymentTerms(RepaymentTerms.LUMP_SUM);
    setJurisdiction('');
    setPurposeAndClauses('');
    setDoublePenaltyOnDefault(true);
    setSelectedRules(DEFAULT_SELECTED_RULES);
    setLenderSignature('');
    setReceiverSignature('');
    setStatus(AgreementStatus.ACTIVE);
    setFormError(null);
  };

  useEffect(() => {
    if (!prefillDraft) return;
    resetForm();
    if (prefillDraft.agreementType) setAgreementType(prefillDraft.agreementType);
    if (prefillDraft.receiverName) setReceiverName(prefillDraft.receiverName);
    if (typeof prefillDraft.amount === 'number' && prefillDraft.amount > 0) {
      setAmount(String(prefillDraft.amount));
    }
    if (prefillDraft.dueDate) setDueDate(prefillDraft.dueDate);
    if (prefillDraft.purposeAndClauses) setPurposeAndClauses(prefillDraft.purposeAndClauses);
    setShowGenerator(true);
    onClearPrefill();
  }, [prefillDraft]);

  const openNewGenerator = () => {
    resetForm();
    setShowGenerator(true);
  };

  const openEditGenerator = (agr: MoneyAgreement) => {
    if (agr.status === AgreementStatus.SETTLED) return;
    setEditingAgreement(agr);
    setAgreementType(agr.agreementType);
    setLenderName(agr.lenderName);
    setReceiverName(agr.receiverName);
    setReceiverDetails(agr.receiverDetails);
    setAmount(String(agr.amount));
    setPaymentMode(agr.paymentMode);
    setPaymentReference(agr.paymentReference);
    setAgreementDate(agr.agreementDate);
    setDueDate(agr.dueDate);
    setInterestRate(String(agr.interestRate));
    setRepaymentTerms(agr.repaymentTerms);
    setJurisdiction(agr.jurisdiction);
    setPurposeAndClauses(agr.purposeAndClauses);
    setDoublePenaltyOnDefault(Boolean(agr.doublePenaltyOnDefault));
    setSelectedRules(Array.isArray(agr.selectedRules) ? agr.selectedRules : DEFAULT_SELECTED_RULES);
    setLenderSignature(agr.lenderSignature || '');
    setReceiverSignature(agr.receiverSignature || '');
    setStatus(agr.status);
    setFormError(null);
    setShowGenerator(true);
  };

  const toggleRule = (ruleId: AgreementRuleId) => {
    setSelectedRules((prev) => {
      if (prev.includes(ruleId)) {
        return prev.filter((id) => id !== ruleId);
      }
      if (prev.length >= BLUEPRINT_LIMITS.MAX_SELECTED_RULES) {
        return prev;
      }
      return [...prev, ruleId];
    });
  };

  const buildDraftRecord = (): MoneyAgreement | null => {
    const cleanLender = clampString(lenderName, BLUEPRINT_LIMITS.LENDER_NAME_MAX);
    const cleanReceiver = clampString(receiverName, BLUEPRINT_LIMITS.RECEIVER_NAME_MAX);
    const cleanDetails = clampString(receiverDetails, BLUEPRINT_LIMITS.RECEIVER_DETAILS_MAX);
    const numAmount = Number(amount);
    const cleanRef = clampString(paymentReference, BLUEPRINT_LIMITS.PAYMENT_REF_MAX);
    const safeAgreementDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(agreementDate)
      ? agreementDate
      : getTodayDateString();
    const cleanDueDate = clampString(dueDate, BLUEPRINT_LIMITS.DEAL_TARGET_DATE_MAX);
    const numInterest = interestRate.trim() === '' ? 0 : Number(interestRate);
    const cleanJurisdiction = clampString(jurisdiction, BLUEPRINT_LIMITS.JURISDICTION_MAX);
    const cleanClauses = clampString(purposeAndClauses, BLUEPRINT_LIMITS.AGREEMENT_CLAUSES_MAX);

    if (!cleanLender) {
      setFormError('Your name (Lender / Payer) is required.');
      return null;
    }
    if (!cleanReceiver) {
      setFormError('Receiver / Borrower name is required.');
      return null;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setFormError('Amount given must be greater than 0.');
      return null;
    }
    if (!Number.isFinite(numInterest) || numInterest < 0 || numInterest > 100) {
      setFormError('Interest rate must be between 0% and 100%.');
      return null;
    }

    return {
      id: editingAgreement?.id ?? 'PREVIEW',
      ownerId: editingAgreement?.ownerId ?? 'owner',
      agreementType,
      lenderName: cleanLender,
      receiverName: cleanReceiver,
      receiverDetails: cleanDetails,
      amount: numAmount,
      paymentMode,
      paymentReference: cleanRef,
      agreementDate: safeAgreementDate,
      dueDate: cleanDueDate,
      interestRate: numInterest,
      repaymentTerms,
      jurisdiction: cleanJurisdiction,
      purposeAndClauses: cleanClauses,
      doublePenaltyOnDefault,
      selectedRules: selectedRules.slice(0, BLUEPRINT_LIMITS.MAX_SELECTED_RULES),
      lenderSignature: lenderSignature.slice(0, BLUEPRINT_LIMITS.SIGNATURE_MAX),
      receiverSignature: receiverSignature.slice(0, BLUEPRINT_LIMITS.SIGNATURE_MAX),
      status,
    };
  };

  const handleSave = async (afterAction: 'none' | 'pdf' | 'print') => {
    setFormError(null);
    const draft = buildDraftRecord();
    if (!draft) return;

    const payload = {
      agreementType: draft.agreementType,
      lenderName: draft.lenderName,
      receiverName: draft.receiverName,
      receiverDetails: draft.receiverDetails,
      amount: draft.amount,
      paymentMode: draft.paymentMode,
      paymentReference: draft.paymentReference,
      agreementDate: draft.agreementDate,
      dueDate: draft.dueDate,
      interestRate: draft.interestRate,
      repaymentTerms: draft.repaymentTerms,
      jurisdiction: draft.jurisdiction,
      purposeAndClauses: draft.purposeAndClauses,
      doublePenaltyOnDefault: draft.doublePenaltyOnDefault,
      selectedRules: draft.selectedRules,
      lenderSignature: draft.lenderSignature,
      receiverSignature: draft.receiverSignature,
      status: draft.status,
    };

    setSubmitting(true);
    try {
      let savedRecord: MoneyAgreement = draft;
      if (editingAgreement) {
        await onUpdateAgreement(editingAgreement, payload);
        savedRecord = { ...editingAgreement, ...payload };
      } else {
        const created = await onAddAgreement(payload);
        if (created) savedRecord = created;
      }

      if (afterAction === 'pdf') {
        exportAgreementPdf(savedRecord, preferredCurrency);
      } else if (afterAction === 'print') {
        onPrintAgreement(savedRecord);
      }

      resetForm();
      setShowGenerator(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save agreement.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeAgreements = agreements.filter((a) => a.status !== AgreementStatus.SETTLED);
  const activeTotal = activeAgreements.reduce((sum, a) => sum + a.amount, 0);

  const visibleAgreements = agreements.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      a.receiverName.toLowerCase().includes(q) ||
      a.lenderName.toLowerCase().includes(q) ||
      a.paymentReference.toLowerCase().includes(q) ||
      a.purposeAndClauses.toLowerCase().includes(q)
    );
  });

  const previewAmountNum = Number(amount);
  const validPreviewAmount = Number.isFinite(previewAmountNum) && previewAmountNum > 0 ? previewAmountNum : 0;

  return (
    <section
      aria-label="Money Agreement Generator and Ledger"
      className="bg-white border border-slate-200 rounded-xl flex flex-col"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900">Money Agreement Generator</h2>
          <p className="text-xs text-slate-500">
            Digital signatures, 2x unpaid double penalty rule, custom clauses, PDF export &amp; print
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-500">Active Agreements Value</div>
            <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
              {formatMoney(activeTotal, preferredCurrency)}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({activeAgreements.length} open)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={showGenerator ? () => { setShowGenerator(false); resetForm(); } : openNewGenerator}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {showGenerator ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showGenerator ? 'Close Generator' : 'New Agreement'}
          </button>
        </div>
      </div>

      {/* Interactive Split Generator + Live Preview */}
      {showGenerator && (
        <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Pane */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave('none');
            }}
            className="lg:col-span-7 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {editingAgreement ? 'Edit Money Agreement' : 'Generate Money Agreement'}
              </h3>
              <span className="text-xs text-slate-500">
                Currency: <span className="font-mono font-medium text-slate-800">{preferredCurrency}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="agr-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Agreement Type
                </label>
                <select
                  id="agr-type"
                  value={agreementType}
                  onChange={(e) => setAgreementType(e.target.value as AgreementType)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {Object.values(AgreementType).map((t) => (
                    <option key={t} value={t}>
                      {AGREEMENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="agr-status" className="block text-xs font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  id="agr-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AgreementStatus)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {Object.values(AgreementStatus).map((s) => (
                    <option key={s} value={s}>
                      {AGREEMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="agr-lender" className="block text-xs font-medium text-slate-700 mb-1">
                  Your Name (Lender / Payer)
                </label>
                <input
                  id="agr-lender"
                  type="text"
                  required
                  value={lenderName}
                  onChange={(e) => setLenderName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.LENDER_NAME_MAX}
                  placeholder="Your full name"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="agr-receiver" className="block text-xs font-medium text-slate-700 mb-1">
                  Receiver / Borrower Name
                </label>
                <input
                  id="agr-receiver"
                  type="text"
                  required
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.RECEIVER_NAME_MAX}
                  placeholder="Person or business receiving money"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="agr-receiver-details" className="block text-xs font-medium text-slate-700 mb-1">
                Receiver Phone / Address / ID (Optional)
              </label>
              <input
                id="agr-receiver-details"
                type="text"
                value={receiverDetails}
                onChange={(e) => setReceiverDetails(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.RECEIVER_DETAILS_MAX}
                placeholder="e.g. +91 98XXXXXX10, Mumbai"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="agr-amount" className="block text-xs font-medium text-slate-700 mb-1">
                  Amount Given ({preferredCurrency})
                </label>
                <input
                  id="agr-amount"
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100000"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="agr-mode" className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Mode
                </label>
                <select
                  id="agr-mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {Object.values(PaymentMode).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="agr-ref" className="block text-xs font-medium text-slate-700 mb-1">
                  UTR / Cheque / Ref No.
                </label>
                <input
                  id="agr-ref"
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.PAYMENT_REF_MAX}
                  placeholder="UPI/NEFT Ref"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="agr-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Date Given
                </label>
                <input
                  id="agr-date"
                  type="date"
                  required
                  value={agreementDate}
                  onChange={(e) => setAgreementDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="agr-due" className="block text-xs font-medium text-slate-700 mb-1">
                  Repayment Due Date
                </label>
                <input
                  id="agr-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="agr-rate" className="block text-xs font-medium text-slate-700 mb-1">
                  Interest (% p.a.)
                </label>
                <input
                  id="agr-rate"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="agr-place" className="block text-xs font-medium text-slate-700 mb-1">
                  City / Place
                </label>
                <input
                  id="agr-place"
                  type="text"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.JURISDICTION_MAX}
                  placeholder="Mumbai, India"
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="agr-repayment" className="block text-xs font-medium text-slate-700 mb-1">
                Repayment Schedule
              </label>
              <select
                id="agr-repayment"
                value={repaymentTerms}
                onChange={(e) => setRepaymentTerms(e.target.value as RepaymentTerms)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Object.values(RepaymentTerms).map((r) => (
                  <option key={r} value={r}>
                    {REPAYMENT_TERMS_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            {/* Double Penalty Rule + Additional Rules */}
            <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div className="text-xs font-semibold text-slate-900">Agreement Rules &amp; Penalties</div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doublePenaltyOnDefault}
                  onChange={(e) => setDoublePenaltyOnDefault(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <div className="text-xs">
                  <div className="font-semibold text-red-700">
                    Double Amount Rule (2x Penalty if Not Paid by Due Date)
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    If unpaid on time, total payable becomes{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {formatMoney(validPreviewAmount * 2, preferredCurrency)}
                    </span>
                    .
                  </div>
                </div>
              </label>

              <div className="border-t border-slate-100 pt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(AgreementRuleId).map((ruleId) => {
                  const rule = AGREEMENT_RULE_CATALOG[ruleId];
                  const checked = selectedRules.includes(ruleId);
                  return (
                    <label
                      key={ruleId}
                      className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRule(ruleId)}
                        className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      <span>{rule.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="agr-clauses" className="block text-xs font-medium text-slate-700 mb-1">
                Purpose &amp; Custom Rules / Clauses
              </label>
              <textarea
                id="agr-clauses"
                rows={2}
                value={purposeAndClauses}
                onChange={(e) => setPurposeAndClauses(e.target.value)}
                maxLength={BLUEPRINT_LIMITS.AGREEMENT_CLAUSES_MAX}
                placeholder="Reason for giving funds, collateral note, or any additional custom rules..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Digital Signature Pads */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <SignaturePad
                label="Your Signature (First Party)"
                value={lenderSignature}
                onChange={setLenderSignature}
              />
              <SignaturePad
                label="Receiver Signature (Second Party)"
                value={receiverSignature}
                onChange={setReceiverSignature}
              />
            </div>

            {status === AgreementStatus.SETTLED && (
              <p className="text-xs text-amber-700">
                Note: Saving an agreement as Settled finalizes and locks its record against future edits.
              </p>
            )}

            {formError && <p className="text-xs text-red-600 font-medium">{formError}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowGenerator(false);
                  resetForm();
                }}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-900 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {submitting ? 'Saving...' : editingAgreement ? 'Update Agreement' : 'Save Agreement'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSave('print')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white text-slate-900 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Save &amp; Print
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSave('pdf')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <FileDown className="w-3.5 h-3.5" />
                Save &amp; Download PDF
              </button>
            </div>
          </form>

          {/* Live Document Preview Pane */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="border-b border-slate-200 pb-3 text-center space-y-1">
                <div className="text-xs font-bold tracking-wide text-slate-900 uppercase">
                  {AGREEMENT_TYPE_LABELS[agreementType]}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Date: {agreementDate}
                  {jurisdiction ? ` · ${jurisdiction}` : ''}
                </div>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">
                This agreement records that{' '}
                <span className="font-semibold text-slate-900">
                  {lenderName.trim() || '[Your Name]'}
                </span>{' '}
                (First Party) has paid{' '}
                <span className="font-semibold font-mono text-slate-900">
                  {formatMoney(validPreviewAmount, preferredCurrency)}
                </span>{' '}
                (
                <span className="italic">
                  {numberToMoneyWords(validPreviewAmount, preferredCurrency)}
                </span>
                ) to{' '}
                <span className="font-semibold text-slate-900">
                  {receiverName.trim() || '[Receiver Name]'}
                </span>{' '}
                (Second Party){receiverDetails.trim() ? ` (${receiverDetails.trim()})` : ''}.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Payment Mode</span>
                  <span className="font-medium text-slate-900">{PAYMENT_MODE_LABELS[paymentMode]}</span>
                </div>
                {paymentReference.trim() && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Reference / UTR</span>
                    <span className="font-mono text-slate-900">{paymentReference.trim()}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Repayment</span>
                  <span className="font-medium text-slate-900 text-right">
                    {REPAYMENT_TERMS_LABELS[repaymentTerms]}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Due Date</span>
                  <span className="font-mono text-slate-900">{dueDate || 'On demand / TBD'}</span>
                </div>
                {doublePenaltyOnDefault && (
                  <div className="flex justify-between gap-2 pt-1 border-t border-slate-200 text-red-700 font-semibold">
                    <span>If Unpaid (Double Rule)</span>
                    <span className="font-mono">{formatMoney(validPreviewAmount * 2, preferredCurrency)}</span>
                  </div>
                )}
              </div>

              {(doublePenaltyOnDefault || selectedRules.length > 0 || purposeAndClauses.trim()) && (
                <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                  <div className="font-semibold text-slate-800">Active Rules &amp; Terms:</div>
                  {doublePenaltyOnDefault && (
                    <p className="text-red-700">
                      • Double Default Rule: Unpaid balance after due date becomes 2x (
                      {formatMoney(validPreviewAmount * 2, preferredCurrency)}).
                    </p>
                  )}
                  {selectedRules.map((ruleId) =>
                    ruleId in AGREEMENT_RULE_CATALOG ? (
                      <p key={ruleId}>• {AGREEMENT_RULE_CATALOG[ruleId as AgreementRuleId].label}</p>
                    ) : null,
                  )}
                  {purposeAndClauses.trim() && <p>• {purposeAndClauses.trim()}</p>}
                </div>
              )}
            </div>

            {/* Signature Previews */}
            <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs text-slate-500">
              <div className="space-y-1">
                <div className="h-12 border-b border-slate-300 flex items-end pb-1">
                  {lenderSignature ? (
                    <img
                      src={lenderSignature}
                      alt="First party signature preview"
                      className="max-h-11 object-contain"
                    />
                  ) : (
                    <span className="text-slate-300 italic">Not signed</span>
                  )}
                </div>
                <div>First Party: {lenderName.trim() || 'Lender'}</div>
              </div>
              <div className="space-y-1">
                <div className="h-12 border-b border-slate-300 flex items-end pb-1">
                  {receiverSignature ? (
                    <img
                      src={receiverSignature}
                      alt="Second party signature preview"
                      className="max-h-11 object-contain"
                    />
                  ) : (
                    <span className="text-slate-300 italic">Not signed</span>
                  )}
                </div>
                <div>Second Party: {receiverName.trim() || 'Receiver'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              ['all', 'All'],
              [AgreementStatus.ACTIVE, 'Active'],
              [AgreementStatus.DRAFT, 'Draft'],
              [AgreementStatus.SETTLED, 'Settled'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search receiver, UTR, or terms..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Agreements List */}
      <div className="divide-y divide-slate-100">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-14 bg-slate-100 rounded" />
            ))}
          </div>
        ) : agreements.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <FileCheck2 className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-900">No money agreements created yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Whenever you give a personal loan, business advance, or deal deposit, sign and generate a formal Money Agreement with the 2x unpaid double penalty rule, custom rules, PDF download, and direct print.
            </p>
            <button
              type="button"
              onClick={openNewGenerator}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create First Agreement
            </button>
          </div>
        ) : visibleAgreements.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No agreements match your current filter.
          </div>
        ) : (
          visibleAgreements.map((agr) => {
            const isSettled = agr.status === AgreementStatus.SETTLED;
            const hasSignatures = Boolean(agr.lenderSignature || agr.receiverSignature);
            return (
              <div
                key={agr.id}
                className="px-5 py-4 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {isSettled && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {agr.receiverName}
                    </span>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-600">
                      {AGREEMENT_TYPE_LABELS[agr.agreementType]}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{PAYMENT_MODE_LABELS[agr.paymentMode]}</span>
                    {agr.paymentReference && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">Ref {agr.paymentReference}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Given {agr.agreementDate}</span>
                    {agr.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Due {agr.dueDate}</span>
                      </>
                    )}
                    {agr.doublePenaltyOnDefault && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-red-700 font-medium">
                          2x Penalty ({formatMoney(agr.amount * 2, preferredCurrency)})
                        </span>
                      </>
                    )}
                    {hasSignatures && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 font-medium">Signed</span>
                      </>
                    )}
                  </div>

                  {agr.purposeAndClauses && (
                    <p className="text-xs text-slate-500 line-clamp-1">{agr.purposeAndClauses}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <div className="text-right mr-1">
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900">
                      {formatMoney(agr.amount, preferredCurrency)}
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        isSettled
                          ? 'text-emerald-700'
                          : agr.status === AgreementStatus.DRAFT
                            ? 'text-slate-500'
                            : 'text-amber-700'
                      }`}
                    >
                      {AGREEMENT_STATUS_LABELS[agr.status]}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPrintAgreement(agr)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                    title="Print Agreement"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>

                  <button
                    type="button"
                    onClick={() => exportAgreementPdf(agr, preferredCurrency)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    PDF
                  </button>

                  {!isSettled && (
                    confirmSettleId === agr.id ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <button
                          type="button"
                          onClick={async () => {
                            await onChangeStatus(agr, AgreementStatus.SETTLED);
                            setConfirmSettleId(null);
                          }}
                          className="font-semibold underline"
                        >
                          Lock Settled
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSettleId(null)}
                          className="text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        value={agr.status}
                        aria-label={`Change status for agreement with ${agr.receiverName}`}
                        onChange={(e) => {
                          const next = e.target.value as AgreementStatus;
                          if (next === AgreementStatus.SETTLED) {
                            setConfirmSettleId(agr.id);
                          } else {
                            onChangeStatus(agr, next);
                          }
                        }}
                        className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 focus:outline-none"
                      >
                        {Object.values(AgreementStatus).map((s) => (
                          <option key={s} value={s}>
                            {AGREEMENT_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    )
                  )}

                  {confirmDeleteId === agr.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteAgreement(agr.id);
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
                    <div className="flex items-center gap-2 text-slate-400">
                      {!isSettled && (
                        <button
                          type="button"
                          onClick={() => openEditGenerator(agr)}
                          className="hover:text-slate-900"
                          aria-label={`Edit agreement with ${agr.receiverName}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(agr.id)}
                        className="hover:text-red-600"
                        aria-label={`Delete agreement with ${agr.receiverName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
