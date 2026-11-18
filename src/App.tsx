import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Briefcase, FileDown, FileSpreadsheet, Lock, LogOut, Printer, TrendingUp, Wallet } from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  AgreementStatus,
  AgreementType,
  BLUEPRINT_LIMITS,
  CashAccount,
  CashAccountType,
  CurrencyCode,
  DealPriority,
  DealStage,
  ExpenseCategory,
  ImportantDeal,
  LiveQuote,
  MoneyAgreement,
  MonthlyExpense,
  PaymentMode,
  RepaymentTerms,
  StockHolding,
  UserProfile,
  WorkspaceView,
} from './types';
import {
  clampString,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatSignedMoney,
  getCurrentMonthKey,
  sanitizeId,
} from './lib/formatters';
import { exportToExcel, exportToPdf } from './lib/exporters';
import { StockColumn } from './components/StockColumn';
import { CashAndSpendColumn } from './components/CashAndSpendColumn';
import { DealsColumn } from './components/DealsColumn';
import {
  type AgreementDraftPrefill,
  AgreementsSection,
} from './components/AgreementsSection';
import { PrintableAgreement } from './components/PrintableAgreement';
import { AppLockScreen } from './components/AppLockScreen';

const APP_UNLOCK_STORAGE_KEY = 'meridian_app_unlock_token';

export default function App() {
  const [appUnlocked, setAppUnlocked] = useState(false);
  const [checkingUnlock, setCheckingUnlock] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [profileReady, setProfileReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [expenses, setExpenses] = useState<MonthlyExpense[]>([]);
  const [deals, setDeals] = useState<ImportantDeal[]>([]);
  const [agreements, setAgreements] = useState<MoneyAgreement[]>([]);
  const [prefillAgreement, setPrefillAgreement] = useState<AgreementDraftPrefill | null>(null);
  const [printingAgreement, setPrintingAgreement] = useState<MoneyAgreement | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeView, setActiveView] = useState<WorkspaceView>(WorkspaceView.ALL);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());

  // Real-time stock quotes
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [isFetchingQuotes, setIsFetchingQuotes] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastQuoteSync, setLastQuoteSync] = useState<number | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  const preferredCurrency = profile?.preferredCurrency ?? CurrencyCode.INR;
  const monthlyBudget = profile?.monthlyBudget ?? 50000;

  // Verify app unlock session token on startup
  useEffect(() => {
    let active = true;
    const verifyStoredToken = async () => {
      const token = sessionStorage.getItem(APP_UNLOCK_STORAGE_KEY);
      if (!token) {
        if (active) {
          setAppUnlocked(false);
          setCheckingUnlock(false);
        }
        return;
      }

      try {
        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (active) {
          if (res.ok) {
            setAppUnlocked(true);
          } else {
            sessionStorage.removeItem(APP_UNLOCK_STORAGE_KEY);
            setAppUnlocked(false);
          }
          setCheckingUnlock(false);
        }
      } catch {
        if (active) {
          setAppUnlocked(false);
          setCheckingUnlock(false);
        }
      }
    };

    verifyStoredToken();
    return () => {
      active = false;
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setAuthError(null);

      if (!nextUser) {
        setProfile(null);
        setProfileReady(false);
        setHoldings([]);
        setCashAccounts([]);
        setExpenses([]);
        setDeals([]);
        setAgreements([]);
        setPrefillAgreement(null);
        setQuotes({});
        setDataLoading(false);
        return;
      }

      const userPath = `users/${nextUser.uid}`;
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            displayName: clampString(
              nextUser.displayName || 'Portfolio Owner',
              BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
            ),
            preferredCurrency: CurrencyCode.INR,
            monthlyBudget: 50000,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          localStorage.setItem('meridian_currency_inr_v1', '1');
        } else if (
          !localStorage.getItem('meridian_currency_inr_v1') &&
          snap.data()?.preferredCurrency === CurrencyCode.USD
        ) {
          await updateDoc(userRef, {
            preferredCurrency: CurrencyCode.INR,
            updatedAt: serverTimestamp(),
          });
          localStorage.setItem('meridian_currency_inr_v1', '1');
        } else {
          localStorage.setItem('meridian_currency_inr_v1', '1');
        }
        setProfileReady(true);
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.WRITE, userPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Firestore real-time listeners (unlocked, authenticated & profile ready)
  useEffect(() => {
    if (!appUnlocked || !user || !profileReady) return;

    setDataLoading(true);
    let pendingInitial = 6;
    const markLoaded = () => {
      pendingInitial -= 1;
      if (pendingInitial <= 0) setDataLoading(false);
    };

    const reportSnapshotError = (err: unknown, path: string) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    const userPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
        markLoaded();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, userPath);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );

    const stocksPath = `users/${user.uid}/stocks`;
    const unsubStocks = onSnapshot(
      query(collection(db, stocksPath), where('ownerId', '==', user.uid)),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as StockHolding);
        rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setHoldings(rows);
        markLoaded();
      },
      (err) => reportSnapshotError(err, stocksPath),
    );

    const cashPath = `users/${user.uid}/cashAccounts`;
    const unsubCash = onSnapshot(
      query(collection(db, cashPath), where('ownerId', '==', user.uid)),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as CashAccount);
        rows.sort((a, b) => b.balance - a.balance);
        setCashAccounts(rows);
        markLoaded();
      },
      (err) => reportSnapshotError(err, cashPath),
    );

    const expensesPath = `users/${user.uid}/expenses`;
    const unsubExpenses = onSnapshot(
      query(collection(db, expensesPath), where('ownerId', '==', user.uid)),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as MonthlyExpense);
        setExpenses(rows);
        markLoaded();
      },
      (err) => reportSnapshotError(err, expensesPath),
    );

    const dealsPath = `users/${user.uid}/deals`;
    const unsubDeals = onSnapshot(
      query(collection(db, dealsPath), where('ownerId', '==', user.uid)),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as ImportantDeal);
        rows.sort((a, b) => {
          if (a.stage === DealStage.CLOSED && b.stage !== DealStage.CLOSED) return 1;
          if (a.stage !== DealStage.CLOSED && b.stage === DealStage.CLOSED) return -1;
          return b.dealValue - a.dealValue;
        });
        setDeals(rows);
        markLoaded();
      },
      (err) => reportSnapshotError(err, dealsPath),
    );

    const agreementsPath = `users/${user.uid}/agreements`;
    const unsubAgreements = onSnapshot(
      query(collection(db, agreementsPath), where('ownerId', '==', user.uid)),
      (snap) => {
        const rows = snap.docs.map((d) => {
          const raw = d.data() as Partial<MoneyAgreement>;
          return {
            ...(raw as MoneyAgreement),
            doublePenaltyOnDefault: Boolean(raw.doublePenaltyOnDefault),
            selectedRules: Array.isArray(raw.selectedRules) ? raw.selectedRules : [],
            lenderSignature: typeof raw.lenderSignature === 'string' ? raw.lenderSignature : '',
            receiverSignature: typeof raw.receiverSignature === 'string' ? raw.receiverSignature : '',
          };
        });
        rows.sort((a, b) => {
          if (a.status === AgreementStatus.SETTLED && b.status !== AgreementStatus.SETTLED) return 1;
          if (a.status !== AgreementStatus.SETTLED && b.status === AgreementStatus.SETTLED) return -1;
          return b.agreementDate.localeCompare(a.agreementDate);
        });
        setAgreements(rows);
        markLoaded();
      },
      (err) => reportSnapshotError(err, agreementsPath),
    );

    return () => {
      unsubProfile();
      unsubStocks();
      unsubCash();
      unsubExpenses();
      unsubDeals();
      unsubAgreements();
    };
  }, [appUnlocked, user, profileReady]);

  // Live stock quote fetcher
  const symbolsKey = useMemo(
    () =>
      Array.from(new Set(holdings.map((h) => h.symbol)))
        .sort()
        .join(','),
    [holdings],
  );

  const fetchLiveQuotes = useCallback(async () => {
    if (!symbolsKey) {
      setQuotes({});
      setLastQuoteSync(Date.now());
      return;
    }

    setIsFetchingQuotes(true);
    try {
      const res = await fetch(
        `/api/stocks/quotes?symbols=${encodeURIComponent(symbolsKey)}&currency=${encodeURIComponent(preferredCurrency)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          quotes?: Record<string, LiveQuote>;
          fetchedAt?: number;
        };
        if (data.quotes) {
          setQuotes(data.quotes);
          setLastQuoteSync(data.fetchedAt ?? Date.now());
        }
      }
    } catch {
      // Retain previous quotes silently on transient network blip
    } finally {
      setIsFetchingQuotes(false);
    }
  }, [symbolsKey, preferredCurrency]);

  useEffect(() => {
    if (!appUnlocked || !user) return;
    fetchLiveQuotes();
  }, [appUnlocked, user, fetchLiveQuotes]);

  useEffect(() => {
    if (!appUnlocked || !user || !autoRefresh || !symbolsKey) return;
    const interval = setInterval(() => {
      fetchLiveQuotes();
    }, 15000);
    return () => clearInterval(interval);
  }, [appUnlocked, user, autoRefresh, symbolsKey, fetchLiveQuotes]);

  // App lock & auth handlers
  const handleAppUnlocked = (token: string) => {
    sessionStorage.setItem(APP_UNLOCK_STORAGE_KEY, token);
    setAppUnlocked(true);
  };

  const handleLockApp = () => {
    sessionStorage.removeItem(APP_UNLOCK_STORAGE_KEY);
    setPrintingAgreement(null);
    setAppUnlocked(false);
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in could not be completed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Profile updates
  const handleCurrencyChange = async (nextCurrency: CurrencyCode) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        preferredCurrency: nextCurrency,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleUpdateMonthlyBudget = async (budget: number) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        monthlyBudget: budget,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Stock CRUD
  const handleAddStock = async (input: {
    symbol: string;
    companyName: string;
    shares: number;
    avgBuyPrice: number;
    currency: string;
    notes: string;
  }) => {
    if (!user) return;
    const id = sanitizeId();
    const path = `users/${user.uid}/stocks/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'stocks', id), {
        id,
        ownerId: user.uid,
        symbol: input.symbol,
        companyName: input.companyName,
        shares: input.shares,
        avgBuyPrice: input.avgBuyPrice,
        currency: input.currency,
        notes: input.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateStock = async (
    stock: StockHolding,
    updates: {
      companyName: string;
      shares: number;
      avgBuyPrice: number;
      currency: string;
      notes: string;
    },
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/stocks/${stock.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'stocks', stock.id), {
        companyName: updates.companyName,
        shares: updates.shares,
        avgBuyPrice: updates.avgBuyPrice,
        currency: updates.currency,
        notes: updates.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteStock = async (stockId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/stocks/${stockId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'stocks', stockId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Cash Accounts CRUD
  const handleAddCashAccount = async (input: {
    name: string;
    balance: number;
    accountType: CashAccountType;
  }) => {
    if (!user) return;
    const id = sanitizeId();
    const path = `users/${user.uid}/cashAccounts/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'cashAccounts', id), {
        id,
        ownerId: user.uid,
        name: input.name,
        balance: input.balance,
        accountType: input.accountType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateCashAccount = async (
    account: CashAccount,
    updates: { name: string; balance: number; accountType: CashAccountType },
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/cashAccounts/${account.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'cashAccounts', account.id), {
        name: updates.name,
        balance: updates.balance,
        accountType: updates.accountType,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteCashAccount = async (accountId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/cashAccounts/${accountId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'cashAccounts', accountId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Monthly Expenses CRUD
  const handleAddExpense = async (input: {
    title: string;
    amount: number;
    category: ExpenseCategory;
    monthKey: string;
    spentDate: string;
    isRecurring: boolean;
  }) => {
    if (!user) return;
    const id = sanitizeId();
    const path = `users/${user.uid}/expenses/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'expenses', id), {
        id,
        ownerId: user.uid,
        title: input.title,
        amount: input.amount,
        category: input.category,
        monthKey: input.monthKey,
        spentDate: input.spentDate,
        isRecurring: input.isRecurring,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateExpense = async (
    expense: MonthlyExpense,
    updates: {
      title: string;
      amount: number;
      category: ExpenseCategory;
      monthKey: string;
      spentDate: string;
      isRecurring: boolean;
    },
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/expenses/${expense.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'expenses', expense.id), {
        title: updates.title,
        amount: updates.amount,
        category: updates.category,
        monthKey: updates.monthKey,
        spentDate: updates.spentDate,
        isRecurring: updates.isRecurring,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/expenses/${expenseId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Important Deals CRUD
  const handleAddDeal = async (input: {
    title: string;
    counterparty: string;
    dealValue: number;
    stage: DealStage;
    priority: DealPriority;
    targetDate: string;
    notes: string;
  }) => {
    if (!user) return;
    const id = sanitizeId();
    const path = `users/${user.uid}/deals/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'deals', id), {
        id,
        ownerId: user.uid,
        title: input.title,
        counterparty: input.counterparty,
        dealValue: input.dealValue,
        stage: input.stage,
        priority: input.priority,
        targetDate: input.targetDate,
        notes: input.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateDeal = async (
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
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/deals/${deal.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'deals', deal.id), {
        title: updates.title,
        counterparty: updates.counterparty,
        dealValue: updates.dealValue,
        stage: updates.stage,
        priority: updates.priority,
        targetDate: updates.targetDate,
        notes: updates.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleChangeDealStage = async (deal: ImportantDeal, nextStage: DealStage) => {
    if (!user) return;
    const path = `users/${user.uid}/deals/${deal.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'deals', deal.id), {
        stage: nextStage,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/deals/${dealId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'deals', dealId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Money Agreements CRUD
  const handleAddAgreement = async (input: {
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
  }): Promise<MoneyAgreement | void> => {
    if (!user) return;
    const id = sanitizeId();
    const path = `users/${user.uid}/agreements/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'agreements', id), {
        id,
        ownerId: user.uid,
        agreementType: input.agreementType,
        lenderName: input.lenderName,
        receiverName: input.receiverName,
        receiverDetails: input.receiverDetails,
        amount: input.amount,
        paymentMode: input.paymentMode,
        paymentReference: input.paymentReference,
        agreementDate: input.agreementDate,
        dueDate: input.dueDate,
        interestRate: input.interestRate,
        repaymentTerms: input.repaymentTerms,
        jurisdiction: input.jurisdiction,
        purposeAndClauses: input.purposeAndClauses,
        doublePenaltyOnDefault: input.doublePenaltyOnDefault,
        selectedRules: input.selectedRules,
        lenderSignature: input.lenderSignature,
        receiverSignature: input.receiverSignature,
        status: input.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        id,
        ownerId: user.uid,
        ...input,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleUpdateAgreement = async (
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
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/agreements/${agreement.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'agreements', agreement.id), {
        agreementType: updates.agreementType,
        lenderName: updates.lenderName,
        receiverName: updates.receiverName,
        receiverDetails: updates.receiverDetails,
        amount: updates.amount,
        paymentMode: updates.paymentMode,
        paymentReference: updates.paymentReference,
        agreementDate: updates.agreementDate,
        dueDate: updates.dueDate,
        interestRate: updates.interestRate,
        repaymentTerms: updates.repaymentTerms,
        jurisdiction: updates.jurisdiction,
        purposeAndClauses: updates.purposeAndClauses,
        doublePenaltyOnDefault: updates.doublePenaltyOnDefault,
        selectedRules: updates.selectedRules,
        lenderSignature: updates.lenderSignature,
        receiverSignature: updates.receiverSignature,
        status: updates.status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleChangeAgreementStatus = async (
    agreement: MoneyAgreement,
    nextStatus: AgreementStatus,
  ) => {
    if (!user) return;
    const path = `users/${user.uid}/agreements/${agreement.id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'agreements', agreement.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteAgreement = async (agreementId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/agreements/${agreementId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'agreements', agreementId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleCreateAgreementFromDeal = (deal: ImportantDeal) => {
    setPrefillAgreement({
      agreementType: AgreementType.DEAL_PAYMENT,
      receiverName: deal.counterparty || deal.title,
      amount: deal.dealValue > 0 ? deal.dealValue : undefined,
      dueDate: deal.targetDate || '',
      purposeAndClauses: `Payment / Advance regarding "${deal.title}". ${deal.notes}`.trim(),
    });
    setActiveView(WorkspaceView.AGREEMENTS);
  };

  const handlePrintAgreement = (agreement: MoneyAgreement) => {
    setPrintingAgreement(agreement);
    const cleanup = () => {
      setPrintingAgreement(null);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 60);
    });
  };

  // Top-level KPI aggregates
  const { totalStockValue, totalStockCost } = useMemo(() => {
    let val = 0;
    let cost = 0;
    for (const h of holdings) {
      const q = quotes[h.symbol];
      const fx = q?.fxRateToTarget ?? 1;
      const price = q ? q.regularMarketPrice : h.avgBuyPrice;
      val += h.shares * price * fx;
      cost += h.shares * h.avgBuyPrice * fx;
    }
    return { totalStockValue: val, totalStockCost: cost };
  }, [holdings, quotes]);

  const totalStockPnL = totalStockValue - totalStockCost;
  const totalStockPnLPct = totalStockCost > 0 ? (totalStockPnL / totalStockCost) * 100 : 0;

  const totalCash = useMemo(
    () => cashAccounts.reduce((acc, a) => acc + a.balance, 0),
    [cashAccounts],
  );

  const selectedMonthSpend = useMemo(
    () =>
      expenses
        .filter((e) => e.monthKey === selectedMonth)
        .reduce((acc, e) => acc + e.amount, 0),
    [expenses, selectedMonth],
  );

  const activeDeals = useMemo(
    () => deals.filter((d) => d.stage !== DealStage.CLOSED),
    [deals],
  );
  const activeDealsValue = useMemo(
    () => activeDeals.reduce((acc, d) => acc + d.dealValue, 0),
    [activeDeals],
  );

  const totalNetWorth = totalStockValue + totalCash;

  if (checkingUnlock) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading Meridian Ledger...</div>
      </div>
    );
  }

  if (!appUnlocked) {
    return <AppLockScreen onUnlocked={handleAppUnlocked} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading Meridian Ledger...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            Meridian Ledger
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#stocks-overview" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Real-Time Stocks
            </a>
            <a href="#cash-overview" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Cash &amp; Spend
            </a>
            <a href="#deals-overview" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Important Deals
            </a>
          </nav>
          <button
            type="button"
            onClick={handleSignIn}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Sign in with Google
          </button>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-16 space-y-14">
          <div className="max-w-2xl space-y-5">
            <h1
              className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Your stocks, cash flow, and important deals in one live ledger.
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              Store every stock position with real-time market valuation, track liquid cash balances alongside monthly spending, and keep high-priority deals organized in a dedicated column.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleSignIn}
                className="px-5 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Sign in with Google to Open Ledger
              </button>
              {authError && <p className="text-xs text-red-600">{authError}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div id="stocks-overview" className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
              <h2 className="text-base font-semibold text-slate-900">Real-Time Stock Portfolio</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Search global tickers, store shares and buy cost, and watch live market prices, intraday trends, and unrealized profit update automatically.
              </p>
            </div>
            <div id="cash-overview" className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <Wallet className="w-5 h-5 text-slate-900" />
              <h2 className="text-base font-semibold text-slate-900">Money on Hand &amp; Monthly Spend</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Record checking, savings, and cash reserves alongside an itemized monthly spending tracker and budget progress bar.
              </p>
            </div>
            <div id="deals-overview" className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <Briefcase className="w-5 h-5 text-amber-700" />
              <h2 className="text-base font-semibold text-slate-900">Important Deals Vault</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Keep contracts, private allocations, and key negotiations in a dedicated pipeline with counterparty, value, target dates, and terms.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {printingAgreement && (
        <PrintableAgreement agreement={printingAgreement} currency={preferredCurrency} />
      )}
      <div className={`min-h-screen bg-slate-50 flex flex-col ${printingAgreement ? 'print:hidden' : ''}`}>
      {/* Three-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView(WorkspaceView.ALL);
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          Meridian Ledger
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {(
            [
              [WorkspaceView.ALL, 'All Columns'],
              [WorkspaceView.STOCKS, 'Stocks'],
              [WorkspaceView.CASH, 'Cash & Spend'],
              [WorkspaceView.DEALS, 'Important Deals'],
              [WorkspaceView.AGREEMENTS, 'Agreements'],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors border-b-2 ${
                activeView === view
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </header>

      <main id="top" className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Workspace Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {profile?.displayName || user.displayName || 'Personal'} Capital Ledger
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live market equities · Liquid cash &amp; monthly spend · Tracked deals
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile View Switcher */}
            <div className="flex md:hidden items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
              {(
                [
                  [WorkspaceView.ALL, 'All'],
                  [WorkspaceView.STOCKS, 'Stocks'],
                  [WorkspaceView.CASH, 'Cash'],
                  [WorkspaceView.DEALS, 'Deals'],
                  [WorkspaceView.AGREEMENTS, 'Agreements'],
                ] as const
              ).map(([view, label]) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    activeView === view ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportToExcel({
                    ownerName: profile?.displayName || user.displayName || 'Portfolio Owner',
                    preferredCurrency,
                    selectedMonth,
                    monthlyBudget,
                    holdings,
                    quotes,
                    cashAccounts,
                    expenses,
                    deals,
                    agreements,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                title="Download Excel workbook (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() =>
                  exportToPdf({
                    ownerName: profile?.displayName || user.displayName || 'Portfolio Owner',
                    preferredCurrency,
                    selectedMonth,
                    monthlyBudget,
                    holdings,
                    quotes,
                    cashAccounts,
                    expenses,
                    deals,
                    agreements,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                title="Download PDF report (.pdf)"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintingAgreement(null);
                  requestAnimationFrame(() => window.print());
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 print:hidden"
                title="Print current view"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              <button
                type="button"
                onClick={handleLockApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 print:hidden"
                title="Lock Meridian Ledger"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="display-currency" className="text-xs text-slate-500 whitespace-nowrap">
                Currency
              </label>
              <select
                id="display-currency"
                value={preferredCurrency}
                onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                className="text-xs font-mono font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Object.values(CurrencyCode).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Full-Width 4-KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Total Net Worth (Stocks + Cash)</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatMoney(totalNetWorth, preferredCurrency)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              {holdings.length} stocks · {cashAccounts.length} cash accounts
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Live Stock Value</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatMoney(totalStockValue, preferredCurrency)}
            </div>
            <div
              className={`text-xs mt-1 font-mono tabular-nums font-medium ${
                totalStockPnL >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {formatSignedMoney(totalStockPnL, preferredCurrency)} ({formatPercent(totalStockPnLPct)})
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Money I Have / Monthly Spend</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatMoney(totalCash, preferredCurrency)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Spent in {formatMonthLabel(selectedMonth)}:{' '}
              <span className="text-red-600 font-medium">
                {formatMoney(selectedMonthSpend, preferredCurrency)}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">Important Deals Pipeline</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatMoney(activeDealsValue, preferredCurrency)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {activeDeals.length} active · {deals.length - activeDeals.length} closed
            </div>
          </div>
        </div>

        {/* 3-Column Workspace Grid + Agreements Generator */}
        {activeView === WorkspaceView.ALL ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-5">
                <StockColumn
                  holdings={holdings}
                  quotes={quotes}
                  preferredCurrency={preferredCurrency}
                  loading={dataLoading}
                  isFetchingQuotes={isFetchingQuotes}
                  autoRefresh={autoRefresh}
                  lastQuoteSync={lastQuoteSync}
                  onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
                  onRefreshQuotes={fetchLiveQuotes}
                  onAddStock={handleAddStock}
                  onUpdateStock={handleUpdateStock}
                  onDeleteStock={handleDeleteStock}
                />
              </div>

              <div className="xl:col-span-4">
                <CashAndSpendColumn
                  cashAccounts={cashAccounts}
                  expenses={expenses}
                  selectedMonth={selectedMonth}
                  monthlyBudget={monthlyBudget}
                  preferredCurrency={preferredCurrency}
                  loading={dataLoading}
                  onChangeMonth={setSelectedMonth}
                  onUpdateMonthlyBudget={handleUpdateMonthlyBudget}
                  onAddCashAccount={handleAddCashAccount}
                  onUpdateCashAccount={handleUpdateCashAccount}
                  onDeleteCashAccount={handleDeleteCashAccount}
                  onAddExpense={handleAddExpense}
                  onUpdateExpense={handleUpdateExpense}
                  onDeleteExpense={handleDeleteExpense}
                />
              </div>

              <div className="xl:col-span-3">
                <DealsColumn
                  deals={deals}
                  preferredCurrency={preferredCurrency}
                  loading={dataLoading}
                  onAddDeal={handleAddDeal}
                  onUpdateDeal={handleUpdateDeal}
                  onChangeStage={handleChangeDealStage}
                  onDeleteDeal={handleDeleteDeal}
                  onCreateAgreementFromDeal={handleCreateAgreementFromDeal}
                />
              </div>
            </div>

            <AgreementsSection
              agreements={agreements}
              defaultLenderName={profile?.displayName || user.displayName || 'Portfolio Owner'}
              preferredCurrency={preferredCurrency}
              loading={dataLoading}
              prefillDraft={prefillAgreement}
              onClearPrefill={() => setPrefillAgreement(null)}
              onPrintAgreement={handlePrintAgreement}
              onAddAgreement={handleAddAgreement}
              onUpdateAgreement={handleUpdateAgreement}
              onChangeStatus={handleChangeAgreementStatus}
              onDeleteAgreement={handleDeleteAgreement}
            />
          </div>
        ) : (
          <div className="max-w-5xl mx-auto w-full">
            {activeView === WorkspaceView.STOCKS && (
              <StockColumn
                holdings={holdings}
                quotes={quotes}
                preferredCurrency={preferredCurrency}
                loading={dataLoading}
                isFetchingQuotes={isFetchingQuotes}
                autoRefresh={autoRefresh}
                lastQuoteSync={lastQuoteSync}
                onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
                onRefreshQuotes={fetchLiveQuotes}
                onAddStock={handleAddStock}
                onUpdateStock={handleUpdateStock}
                onDeleteStock={handleDeleteStock}
              />
            )}
            {activeView === WorkspaceView.CASH && (
              <CashAndSpendColumn
                cashAccounts={cashAccounts}
                expenses={expenses}
                selectedMonth={selectedMonth}
                monthlyBudget={monthlyBudget}
                preferredCurrency={preferredCurrency}
                loading={dataLoading}
                onChangeMonth={setSelectedMonth}
                onUpdateMonthlyBudget={handleUpdateMonthlyBudget}
                onAddCashAccount={handleAddCashAccount}
                onUpdateCashAccount={handleUpdateCashAccount}
                onDeleteCashAccount={handleDeleteCashAccount}
                onAddExpense={handleAddExpense}
                onUpdateExpense={handleUpdateExpense}
                onDeleteExpense={handleDeleteExpense}
              />
            )}
            {activeView === WorkspaceView.DEALS && (
              <DealsColumn
                deals={deals}
                preferredCurrency={preferredCurrency}
                loading={dataLoading}
                onAddDeal={handleAddDeal}
                onUpdateDeal={handleUpdateDeal}
                onChangeStage={handleChangeDealStage}
                onDeleteDeal={handleDeleteDeal}
                onCreateAgreementFromDeal={handleCreateAgreementFromDeal}
              />
            )}
            {activeView === WorkspaceView.AGREEMENTS && (
              <AgreementsSection
                agreements={agreements}
                defaultLenderName={profile?.displayName || user.displayName || 'Portfolio Owner'}
                preferredCurrency={preferredCurrency}
                loading={dataLoading}
                prefillDraft={prefillAgreement}
                onClearPrefill={() => setPrefillAgreement(null)}
                onPrintAgreement={handlePrintAgreement}
                onAddAgreement={handleAddAgreement}
                onUpdateAgreement={handleUpdateAgreement}
                onChangeStatus={handleChangeAgreementStatus}
                onDeleteAgreement={handleDeleteAgreement}
              />
            )}
          </div>
        )}
      </main>
    </div>
    </>
  );
}
