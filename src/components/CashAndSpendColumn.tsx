import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  CashAccount,
  CashAccountType,
  CurrencyCode,
  ExpenseCategory,
  MonthlyExpense,
} from '../types';
import {
  ACCOUNT_TYPE_LABELS,
  clampString,
  EXPENSE_CATEGORY_LABELS,
  formatMoney,
  formatMonthLabel,
  getTodayDateString,
  shiftMonthKey,
} from '../lib/formatters';

interface CashAndSpendColumnProps {
  cashAccounts: CashAccount[];
  expenses: MonthlyExpense[];
  selectedMonth: string;
  monthlyBudget: number;
  preferredCurrency: CurrencyCode;
  loading: boolean;
  onChangeMonth: (nextMonth: string) => void;
  onUpdateMonthlyBudget: (budget: number) => Promise<void>;
  onAddCashAccount: (input: {
    name: string;
    balance: number;
    accountType: CashAccountType;
  }) => Promise<void>;
  onUpdateCashAccount: (
    account: CashAccount,
    updates: { name: string; balance: number; accountType: CashAccountType },
  ) => Promise<void>;
  onDeleteCashAccount: (accountId: string) => Promise<void>;
  onAddExpense: (input: {
    title: string;
    amount: number;
    category: ExpenseCategory;
    monthKey: string;
    spentDate: string;
    isRecurring: boolean;
  }) => Promise<void>;
  onUpdateExpense: (
    expense: MonthlyExpense,
    updates: {
      title: string;
      amount: number;
      category: ExpenseCategory;
      monthKey: string;
      spentDate: string;
      isRecurring: boolean;
    },
  ) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

export function CashAndSpendColumn({
  cashAccounts,
  expenses,
  selectedMonth,
  monthlyBudget,
  preferredCurrency,
  loading,
  onChangeMonth,
  onUpdateMonthlyBudget,
  onAddCashAccount,
  onUpdateCashAccount,
  onDeleteCashAccount,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}: CashAndSpendColumnProps) {
  // Cash account state
  const [showCashForm, setShowCashForm] = useState(false);
  const [editingCash, setEditingCash] = useState<CashAccount | null>(null);
  const [cashName, setCashName] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [cashType, setCashType] = useState<CashAccountType>(CashAccountType.CHECKING);
  const [confirmDeleteCashId, setConfirmDeleteCashId] = useState<string | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const [savingCash, setSavingCash] = useState(false);

  // Budget state
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(String(monthlyBudget));

  // Expense state
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MonthlyExpense | null>(null);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>(ExpenseCategory.FOOD);
  const [expDate, setExpDate] = useState(getTodayDateString());
  const [expRecurring, setExpRecurring] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [confirmDeleteExpId, setConfirmDeleteExpId] = useState<string | null>(null);
  const [expError, setExpError] = useState<string | null>(null);
  const [savingExp, setSavingExp] = useState(false);

  const totalCash = cashAccounts.reduce((acc, item) => acc + item.balance, 0);

  const monthExpenses = expenses
    .filter((exp) => exp.monthKey === selectedMonth)
    .sort((a, b) => b.spentDate.localeCompare(a.spentDate));

  const totalMonthSpent = monthExpenses.reduce((acc, exp) => acc + exp.amount, 0);
  const filteredMonthExpenses =
    categoryFilter === 'all'
      ? monthExpenses
      : monthExpenses.filter((exp) => exp.category === categoryFilter);

  const budgetRatio = monthlyBudget > 0 ? (totalMonthSpent / monthlyBudget) * 100 : 0;
  const budgetStatusLabel =
    monthlyBudget <= 0
      ? 'No budget set'
      : budgetRatio > 100
        ? 'Over Budget'
        : budgetRatio >= 80
          ? 'Near Limit'
          : 'On Track';
  const budgetBarColor =
    budgetRatio > 100
      ? 'bg-red-600'
      : budgetRatio >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  const resetCashForm = () => {
    setEditingCash(null);
    setCashName('');
    setCashBalance('');
    setCashType(CashAccountType.CHECKING);
    setCashError(null);
  };

  const handleSaveCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashError(null);
    const cleanName = clampString(cashName, BLUEPRINT_LIMITS.ACCOUNT_NAME_MAX);
    const numBalance = Number(cashBalance);
    if (!cleanName) {
      setCashError('Account or balance label is required.');
      return;
    }
    if (!Number.isFinite(numBalance) || numBalance < 0) {
      setCashError('Balance must be 0 or greater.');
      return;
    }

    setSavingCash(true);
    try {
      if (editingCash) {
        await onUpdateCashAccount(editingCash, {
          name: cleanName,
          balance: numBalance,
          accountType: cashType,
        });
      } else {
        await onAddCashAccount({
          name: cleanName,
          balance: numBalance,
          accountType: cashType,
        });
      }
      resetCashForm();
      setShowCashForm(false);
    } catch (err) {
      setCashError(err instanceof Error ? err.message : 'Unable to save balance.');
    } finally {
      setSavingCash(false);
    }
  };

  const resetExpenseForm = () => {
    setEditingExpense(null);
    setExpTitle('');
    setExpAmount('');
    setExpCategory(ExpenseCategory.FOOD);
    const today = getTodayDateString();
    setExpDate(today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`);
    setExpRecurring(false);
    setExpError(null);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);
    const cleanTitle = clampString(expTitle, BLUEPRINT_LIMITS.EXPENSE_TITLE_MAX);
    const numAmount = Number(expAmount);
    const safeDate = BLUEPRINT_LIMITS.DATE_PATTERN.test(expDate)
      ? expDate
      : `${selectedMonth}-01`;
    const derivedMonthKey = safeDate.slice(0, 7);

    if (!cleanTitle) {
      setExpError('Expense description is required.');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setExpError('Amount must be greater than 0.');
      return;
    }

    setSavingExp(true);
    try {
      if (editingExpense) {
        await onUpdateExpense(editingExpense, {
          title: cleanTitle,
          amount: numAmount,
          category: expCategory,
          monthKey: derivedMonthKey,
          spentDate: safeDate,
          isRecurring: expRecurring,
        });
      } else {
        await onAddExpense({
          title: cleanTitle,
          amount: numAmount,
          category: expCategory,
          monthKey: derivedMonthKey,
          spentDate: safeDate,
          isRecurring: expRecurring,
        });
      }
      resetExpenseForm();
      setShowExpenseForm(false);
    } catch (err) {
      setExpError(err instanceof Error ? err.message : 'Unable to log expense.');
    } finally {
      setSavingExp(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(budgetDraft);
    if (!Number.isFinite(num) || num < 0) return;
    await onUpdateMonthlyBudget(num);
    setEditingBudget(false);
  };

  return (
    <section
      aria-label="Cash Available and Monthly Spending"
      className="bg-white border border-slate-200 rounded-xl flex flex-col min-h-[540px]"
    >
      {/* Part 1: Money I Have */}
      <div className="p-5 border-b border-slate-200 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Cash &amp; Monthly Spend</h2>
            <p className="text-xs text-slate-500 mt-0.5">Money on hand &amp; monthly expenses</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showCashForm) {
                setShowCashForm(false);
                resetCashForm();
              } else {
                resetCashForm();
                setShowCashForm(true);
              }
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            {showCashForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showCashForm ? 'Close' : 'Add Balance'}
          </button>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <div>
            <div className="text-xs text-slate-500">Money I Have</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatMoney(totalCash, preferredCurrency)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Spent This Month</div>
            <div className="text-base font-semibold font-mono tabular-nums text-red-600 mt-0.5">
              {formatMoney(totalMonthSpent, preferredCurrency)}
            </div>
          </div>
        </div>

        {showCashForm && (
          <form onSubmit={handleSaveCash} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">
              {editingCash ? `Update ${editingCash.name}` : 'Add Money Balance'}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="cash-name" className="block text-xs text-slate-600 mb-1">
                  Account / Source
                </label>
                <input
                  id="cash-name"
                  type="text"
                  required
                  value={cashName}
                  onChange={(e) => setCashName(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.ACCOUNT_NAME_MAX}
                  placeholder="Checking Account"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="cash-type" className="block text-xs text-slate-600 mb-1">
                  Type
                </label>
                <select
                  id="cash-type"
                  value={cashType}
                  onChange={(e) => setCashType(e.target.value as CashAccountType)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {Object.values(CashAccountType).map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="cash-balance" className="block text-xs text-slate-600 mb-1">
                Available Balance ({preferredCurrency})
              </label>
              <input
                id="cash-balance"
                type="number"
                step="any"
                min="0"
                required
                value={cashBalance}
                onChange={(e) => setCashBalance(e.target.value)}
                placeholder="50000.00"
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            {cashError && <p className="text-xs text-red-600">{cashError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCashForm(false);
                  resetCashForm();
                }}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCash}
                className="px-3 py-1 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {savingCash ? 'Saving...' : editingCash ? 'Save Balance' : 'Add Balance'}
              </button>
            </div>
          </form>
        )}

        {/* Cash Account List */}
        {!loading && cashAccounts.length > 0 && (
          <div className="divide-y divide-slate-100 pt-1">
            {cashAccounts.map((acc) => (
              <div key={acc.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800 truncate block">{acc.name}</span>
                  <span className="text-slate-400">{ACCOUNT_TYPE_LABELS[acc.accountType]}</span>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                    {formatMoney(acc.balance, preferredCurrency)}
                  </span>
                  {confirmDeleteCashId === acc.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteCashAccount(acc.id);
                          setConfirmDeleteCashId(null);
                        }}
                        className="text-red-600 font-medium"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCashId(null)}
                        className="text-slate-400"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCash(acc);
                          setCashName(acc.name);
                          setCashBalance(String(acc.balance));
                          setCashType(acc.accountType);
                          setCashError(null);
                          setShowCashForm(true);
                        }}
                        className="hover:text-slate-900"
                        aria-label={`Edit ${acc.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCashId(acc.id)}
                        className="hover:text-red-600"
                        aria-label={`Delete ${acc.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Part 2: Monthly Spending */}
      <div className="p-5 border-b border-slate-200 space-y-3 bg-slate-50/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, -1))}
              className="p-1 rounded hover:bg-slate-200/70 text-slate-600"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-900 min-w-[116px] text-center">
              {formatMonthLabel(selectedMonth)}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, 1))}
              className="p-1 rounded hover:bg-slate-200/70 text-slate-600"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showExpenseForm) {
                setShowExpenseForm(false);
                resetExpenseForm();
              } else {
                resetExpenseForm();
                setShowExpenseForm(true);
              }
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {showExpenseForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showExpenseForm ? 'Close' : 'Log Expense'}
          </button>
        </div>

        {/* Monthly Budget Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Monthly Budget:</span>
              {editingBudget ? (
                <form onSubmit={handleSaveBudget} className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    className="w-24 px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded"
                    aria-label="Monthly spending budget"
                  />
                  <button
                    type="submit"
                    className="px-2 py-0.5 text-xs font-medium bg-slate-900 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBudget(false)}
                    className="text-slate-500 px-1"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setBudgetDraft(String(monthlyBudget));
                    setEditingBudget(true);
                  }}
                  className="font-mono font-medium text-slate-900 hover:underline"
                >
                  {formatMoney(monthlyBudget, preferredCurrency)}
                </button>
              )}
            </div>
            <span
              className={`font-medium ${
                budgetRatio > 100
                  ? 'text-red-600'
                  : budgetRatio >= 80
                    ? 'text-amber-700'
                    : 'text-emerald-700'
              }`}
            >
              {budgetStatusLabel}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${budgetBarColor}`}
              style={{ width: `${Math.min(100, Math.max(0, budgetRatio))}%` }}
            />
          </div>
        </div>

        {showExpenseForm && (
          <form onSubmit={handleSaveExpense} className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2.5">
            <div className="text-xs font-semibold text-slate-800">
              {editingExpense ? 'Edit Expense' : 'Log Monthly Expense'}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="exp-title" className="block text-xs text-slate-600 mb-1">
                  Item / Merchant
                </label>
                <input
                  id="exp-title"
                  type="text"
                  required
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  maxLength={BLUEPRINT_LIMITS.EXPENSE_TITLE_MAX}
                  placeholder="Rent, Groceries..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label htmlFor="exp-amount" className="block text-xs text-slate-600 mb-1">
                  Amount ({preferredCurrency})
                </label>
                <input
                  id="exp-amount"
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="1500.00"
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="exp-category" className="block text-xs text-slate-600 mb-1">
                  Category
                </label>
                <select
                  id="exp-category"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {Object.values(ExpenseCategory).map((cat) => (
                    <option key={cat} value={cat}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="exp-date" className="block text-xs text-slate-600 mb-1">
                  Date
                </label>
                <input
                  id="exp-date"
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={expRecurring}
                onChange={(e) => setExpRecurring(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Recurring monthly expense
            </label>

            {expError && <p className="text-xs text-red-600">{expError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExpenseForm(false);
                  resetExpenseForm();
                }}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingExp}
                className="px-3 py-1 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {savingExp ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </form>
        )}

        {monthExpenses.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-500">
              {filteredMonthExpenses.length} {filteredMonthExpenses.length === 1 ? 'entry' : 'entries'}
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter expenses by category"
              className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {Object.values(ExpenseCategory).map((cat) => (
                <option key={cat} value={cat}>
                  {EXPENSE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Expense List */}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : filteredMonthExpenses.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs font-medium text-slate-700">
              No spending logged for {formatMonthLabel(selectedMonth)}
            </p>
            <p className="text-xs text-slate-500">
              Track monthly bills, subscriptions, and daily spending here.
            </p>
          </div>
        ) : (
          filteredMonthExpenses.map((exp) => (
            <div key={exp.id} className="px-5 py-3 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{exp.title}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span>{EXPENSE_CATEGORY_LABELS[exp.category]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{exp.spentDate}</span>
                  {exp.isRecurring && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Recurring</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-mono font-semibold tabular-nums text-slate-900">
                  -{formatMoney(exp.amount, preferredCurrency)}
                </span>
                {confirmDeleteExpId === exp.id ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteExpense(exp.id);
                        setConfirmDeleteExpId(null);
                      }}
                      className="text-red-600 font-medium"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteExpId(null)}
                      className="text-slate-400"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExpense(exp);
                        setExpTitle(exp.title);
                        setExpAmount(String(exp.amount));
                        setExpCategory(exp.category);
                        setExpDate(exp.spentDate);
                        setExpRecurring(exp.isRecurring);
                        setExpError(null);
                        setShowExpenseForm(true);
                      }}
                      className="hover:text-slate-900"
                      aria-label={`Edit ${exp.title}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteExpId(exp.id)}
                      className="hover:text-red-600"
                      aria-label={`Delete ${exp.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
