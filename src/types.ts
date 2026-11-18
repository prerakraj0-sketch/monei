import type { Timestamp } from 'firebase/firestore';

export enum CurrencyCode {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  INR = 'INR',
  CAD = 'CAD',
  AUD = 'AUD',
  JPY = 'JPY',
}

export enum CashAccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  BROKERAGE = 'brokerage',
  CASH = 'cash',
  OTHER = 'other',
}

export enum ExpenseCategory {
  HOUSING = 'housing',
  FOOD = 'food',
  TRANSPORT = 'transport',
  UTILITIES = 'utilities',
  SUBSCRIPTIONS = 'subscriptions',
  SHOPPING = 'shopping',
  BUSINESS = 'business',
  OTHER = 'other',
}

export enum DealStage {
  WATCHLIST = 'watchlist',
  NEGOTIATING = 'negotiating',
  ACTIVE = 'active',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

export enum DealPriority {
  HIGH = 'high',
  NORMAL = 'normal',
}

export enum AgreementType {
  PERSONAL_LOAN = 'personal_loan',
  BUSINESS_ADVANCE = 'business_advance',
  DEAL_PAYMENT = 'deal_payment',
  SECURITY_DEPOSIT = 'security_deposit',
}

export enum PaymentMode {
  UPI = 'upi',
  BANK_TRANSFER = 'bank_transfer',
  CHEQUE = 'cheque',
  CASH = 'cash',
}

export enum RepaymentTerms {
  LUMP_SUM = 'lump_sum',
  MONTHLY_INSTALLMENTS = 'monthly_installments',
  ON_DEMAND = 'on_demand',
  MILESTONE = 'milestone',
}

export enum AgreementStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SETTLED = 'settled',
}

export enum AgreementRuleId {
  NO_SETOFF = 'no_setoff',
  GRACE_NOTICE = 'grace_notice',
  LEGAL_RECOVERY_COSTS = 'legal_recovery_costs',
  DISHONOUR_PENALTY = 'dishonour_penalty',
  COLLATERAL_SECURITY = 'collateral_security',
  WITNESS_ATTESTATION = 'witness_attestation',
}

export enum WorkspaceView {
  ALL = 'all',
  STOCKS = 'stocks',
  CASH = 'cash',
  DEALS = 'deals',
  AGREEMENTS = 'agreements',
}

// Synchronized verbatim with firebase-blueprint.json
export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  DISPLAY_NAME_MAX: 100,
  SYMBOL_MIN: 1,
  SYMBOL_MAX: 20,
  SYMBOL_PATTERN: /^[A-Z0-9.\-=]+$/,
  COMPANY_NAME_MAX: 120,
  STOCK_NOTES_MAX: 300,
  CURRENCY_MIN: 3,
  CURRENCY_MAX: 10,
  ACCOUNT_NAME_MAX: 80,
  EXPENSE_TITLE_MAX: 100,
  MONTH_KEY_PATTERN: /^\d{4}-\d{2}$/,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  DEAL_TITLE_MAX: 120,
  DEAL_COUNTERPARTY_MAX: 100,
  DEAL_TARGET_DATE_MAX: 20,
  DEAL_NOTES_MAX: 500,
  LENDER_NAME_MAX: 100,
  RECEIVER_NAME_MAX: 100,
  RECEIVER_DETAILS_MAX: 200,
  PAYMENT_REF_MAX: 80,
  JURISDICTION_MAX: 80,
  AGREEMENT_CLAUSES_MAX: 1500,
  SIGNATURE_MAX: 45000,
  MAX_SELECTED_RULES: 10,
} as const;

export interface UserProfile {
  uid: string;
  displayName: string;
  preferredCurrency: CurrencyCode;
  monthlyBudget: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StockHolding {
  id: string;
  ownerId: string;
  symbol: string;
  companyName: string;
  shares: number;
  avgBuyPrice: number;
  currency: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CashAccount {
  id: string;
  ownerId: string;
  name: string;
  balance: number;
  accountType: CashAccountType;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MonthlyExpense {
  id: string;
  ownerId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  monthKey: string;
  spentDate: string;
  isRecurring: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ImportantDeal {
  id: string;
  ownerId: string;
  title: string;
  counterparty: string;
  dealValue: number;
  stage: DealStage;
  priority: DealPriority;
  targetDate: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MoneyAgreement {
  id: string;
  ownerId: string;
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LiveQuote {
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

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string;
}
