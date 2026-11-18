import {
  AgreementStatus,
  AgreementType,
  BLUEPRINT_LIMITS,
  CashAccountType,
  CurrencyCode,
  DealStage,
  ExpenseCategory,
  PaymentMode,
  RepaymentTerms,
} from '../types';

export function formatMoney(value: number, currency: string = CurrencyCode.INR): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  const code = currency.toUpperCase();
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'JPY' ? 0 : 2,
      maximumFractionDigits: code === 'JPY' ? 0 : 2,
    }).format(safeVal);
  } catch {
    return `${code} ${safeVal.toFixed(2)}`;
  }
}

export function formatSignedMoney(value: number, currency: string = CurrencyCode.INR): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  const formatted = formatMoney(Math.abs(safeVal), currency);
  if (safeVal > 0.004) return `+${formatted}`;
  if (safeVal < -0.004) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  const sign = safeVal > 0.004 ? '+' : safeVal < -0.004 ? '-' : '';
  return `${sign}${Math.abs(safeVal).toFixed(2)}%`;
}

export function formatShares(shares: number): string {
  if (!Number.isFinite(shares)) return '0';
  return Number.isInteger(shares) ? shares.toString() : shares.toFixed(4).replace(/\.?0+$/, '');
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const date = new Date(Number(yStr), Number(mStr) - 1 + deltaMonths, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey: string): string {
  if (!BLUEPRINT_LIMITS.MONTH_KEY_PATTERN.test(monthKey)) return monthKey;
  const [yStr, mStr] = monthKey.split('-');
  const date = new Date(Number(yStr), Number(mStr) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatTimeAgo(timestampMs: number | null): string {
  if (!timestampMs) return 'Syncing';
  return new Date(timestampMs).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function sanitizeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '');
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(num: number): string {
  if (num < 20) return ONES[num];
  const t = Math.floor(num / 10);
  const o = num % 10;
  return o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function threeDigitsToWords(num: number): string {
  const h = Math.floor(num / 100);
  const rest = num % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} Hundred`);
  if (rest > 0) parts.push(twoDigitsToWords(rest));
  return parts.join(' ');
}

export function numberToMoneyWords(amount: number, currency: CurrencyCode = CurrencyCode.INR): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'Zero Only';
  const whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);

  const parts: string[] = [];
  if (whole === 0) {
    parts.push('Zero');
  } else {
    const crore = Math.floor(whole / 10000000);
    const lakh = Math.floor((whole % 10000000) / 100000);
    const thousand = Math.floor((whole % 100000) / 1000);
    const remainder = whole % 1000;

    if (crore > 0) parts.push(`${threeDigitsToWords(crore)} Crore`);
    if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
    if (remainder > 0) parts.push(threeDigitsToWords(remainder));
  }

  const unit = currency === CurrencyCode.INR ? 'Rupees' : currency;
  const subUnit = currency === CurrencyCode.INR ? 'Paise' : 'Cents';
  const wholePhrase = `${unit} ${parts.join(' ')}`;
  if (paise > 0) {
    return `${wholePhrase} and ${twoDigitsToWords(paise)} ${subUnit} Only`;
  }
  return `${wholePhrase} Only`;
}

export const ACCOUNT_TYPE_LABELS: Record<CashAccountType, string> = {
  [CashAccountType.CHECKING]: 'Checking',
  [CashAccountType.SAVINGS]: 'Savings',
  [CashAccountType.BROKERAGE]: 'Brokerage Cash',
  [CashAccountType.CASH]: 'Cash Reserve',
  [CashAccountType.OTHER]: 'Other Account',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.HOUSING]: 'Housing',
  [ExpenseCategory.FOOD]: 'Food & Dining',
  [ExpenseCategory.TRANSPORT]: 'Transport',
  [ExpenseCategory.UTILITIES]: 'Utilities',
  [ExpenseCategory.SUBSCRIPTIONS]: 'Subscriptions',
  [ExpenseCategory.SHOPPING]: 'Shopping',
  [ExpenseCategory.BUSINESS]: 'Business',
  [ExpenseCategory.OTHER]: 'Other',
};

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  [DealStage.WATCHLIST]: 'Watchlist',
  [DealStage.NEGOTIATING]: 'Negotiating',
  [DealStage.ACTIVE]: 'Active',
  [DealStage.CLOSING]: 'Closing Soon',
  [DealStage.CLOSED]: 'Closed',
};

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  [AgreementType.PERSONAL_LOAN]: 'Personal Loan Agreement',
  [AgreementType.BUSINESS_ADVANCE]: 'Business Advance Agreement',
  [AgreementType.DEAL_PAYMENT]: 'Deal / Investment Payment Agreement',
  [AgreementType.SECURITY_DEPOSIT]: 'Security / Token Deposit Receipt',
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  [PaymentMode.UPI]: 'UPI Transfer',
  [PaymentMode.BANK_TRANSFER]: 'Bank Transfer (NEFT / RTGS / IMPS)',
  [PaymentMode.CHEQUE]: 'Cheque',
  [PaymentMode.CASH]: 'Cash Handover',
};

export const REPAYMENT_TERMS_LABELS: Record<RepaymentTerms, string> = {
  [RepaymentTerms.LUMP_SUM]: 'Full Lump Sum on Due Date',
  [RepaymentTerms.MONTHLY_INSTALLMENTS]: 'Monthly Installments (EMI)',
  [RepaymentTerms.ON_DEMAND]: 'Repayable On Demand (Notice Period)',
  [RepaymentTerms.MILESTONE]: 'Upon Deal / Project Milestone',
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  [AgreementStatus.DRAFT]: 'Draft',
  [AgreementStatus.ACTIVE]: 'Active',
  [AgreementStatus.SETTLED]: 'Settled',
};
