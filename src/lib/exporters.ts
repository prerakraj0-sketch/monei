import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  AgreementRuleId,
  CashAccount,
  CurrencyCode,
  ImportantDeal,
  LiveQuote,
  MoneyAgreement,
  MonthlyExpense,
  StockHolding,
} from '../types';
import {
  ACCOUNT_TYPE_LABELS,
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  DEAL_STAGE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  formatMonthLabel,
  formatPercent,
  formatShares,
  getTodayDateString,
  numberToMoneyWords,
  PAYMENT_MODE_LABELS,
  REPAYMENT_TERMS_LABELS,
} from './formatters';
import { AGREEMENT_RULE_CATALOG } from '../components/PrintableAgreement';

export interface LedgerExportPayload {
  ownerName: string;
  preferredCurrency: CurrencyCode;
  selectedMonth: string;
  monthlyBudget: number;
  holdings: StockHolding[];
  quotes: Record<string, LiveQuote>;
  cashAccounts: CashAccount[];
  expenses: MonthlyExpense[];
  deals: ImportantDeal[];
  agreements: MoneyAgreement[];
}

function formatPdfMoney(value: number, currency: string): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  const code = currency.toUpperCase();
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: code === 'JPY' ? 0 : 2,
    maximumFractionDigits: code === 'JPY' ? 0 : 2,
  }).format(Math.abs(safeVal));

  const prefix = code === 'INR' ? 'Rs. ' : code === 'USD' ? '$' : `${code} `;
  return `${safeVal < -0.004 ? '-' : ''}${prefix}${formattedNumber}`;
}

function formatPdfSignedMoney(value: number, currency: string): string {
  const safeVal = Number.isFinite(value) ? value : 0;
  if (safeVal > 0.004) return `+${formatPdfMoney(safeVal, currency)}`;
  return formatPdfMoney(safeVal, currency);
}

function roundTwo(val: number): number {
  return Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
}

function computeTotals(payload: LedgerExportPayload) {
  let totalStockValue = 0;
  let totalStockCost = 0;

  const stockRows = payload.holdings.map((h) => {
    const q = payload.quotes[h.symbol];
    const fx = q?.fxRateToTarget ?? 1;
    const livePriceNative = q ? q.regularMarketPrice : h.avgBuyPrice;
    const marketValueTarget = h.shares * livePriceNative * fx;
    const costBasisTarget = h.shares * h.avgBuyPrice * fx;
    const gainLossTarget = marketValueTarget - costBasisTarget;
    const gainLossPct = costBasisTarget > 0 ? (gainLossTarget / costBasisTarget) * 100 : 0;

    totalStockValue += marketValueTarget;
    totalStockCost += costBasisTarget;

    return {
      holding: h,
      quote: q,
      livePriceNative,
      marketValueTarget,
      costBasisTarget,
      gainLossTarget,
      gainLossPct,
    };
  });

  const totalCash = payload.cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const monthExpenses = payload.expenses
    .filter((e) => e.monthKey === payload.selectedMonth)
    .sort((a, b) => b.spentDate.localeCompare(a.spentDate));
  const selectedMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAllExpenses = payload.expenses.reduce((sum, e) => sum + e.amount, 0);
  const activeDeals = payload.deals.filter((d) => d.stage !== 'closed');
  const activeDealsValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const activeAgreements = payload.agreements.filter((a) => a.status !== 'settled');
  const activeAgreementsValue = activeAgreements.reduce((sum, a) => sum + a.amount, 0);

  return {
    stockRows,
    totalStockValue,
    totalStockCost,
    totalStockPnL: totalStockValue - totalStockCost,
    totalStockPnLPct:
      totalStockCost > 0 ? ((totalStockValue - totalStockCost) / totalStockCost) * 100 : 0,
    totalCash,
    totalNetWorth: totalStockValue + totalCash,
    monthExpenses,
    selectedMonthSpend,
    totalAllExpenses,
    activeDealsCount: activeDeals.length,
    activeDealsValue,
    activeAgreementsCount: activeAgreements.length,
    activeAgreementsValue,
  };
}

export function exportToExcel(payload: LedgerExportPayload): void {
  const totals = computeTotals(payload);
  const wb = XLSX.utils.book_new();
  const today = getTodayDateString();
  const curr = payload.preferredCurrency;

  const summaryRows = [
    ['Meridian Ledger Financial Report', ''],
    ['Owner', payload.ownerName],
    ['Generated Date', new Date().toLocaleString()],
    ['Display Currency', curr],
    ['Selected Spending Month', formatMonthLabel(payload.selectedMonth)],
    ['', ''],
    ['Metric', `Amount (${curr})`],
    ['Total Net Worth (Stocks + Cash)', roundTwo(totals.totalNetWorth)],
    ['Live Stock Portfolio Value', roundTwo(totals.totalStockValue)],
    ['Total Stock Cost Basis', roundTwo(totals.totalStockCost)],
    ['Stock Unrealized Gain / Loss', roundTwo(totals.totalStockPnL)],
    ['Total Money on Hand (Cash)', roundTwo(totals.totalCash)],
    [`Spent in ${formatMonthLabel(payload.selectedMonth)}`, roundTwo(totals.selectedMonthSpend)],
    ['Monthly Budget Target', roundTwo(payload.monthlyBudget)],
    ['Active Important Deals Value', roundTwo(totals.activeDealsValue)],
    ['Active Money Agreements Receivable / Given', roundTwo(totals.activeAgreementsValue)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  const stockSheetData = totals.stockRows.map((row) => ({
    Symbol: row.holding.symbol,
    Company: row.holding.companyName,
    Source: row.quote?.exchangeName || 'Manual',
    'Quote Currency': row.quote?.currency || row.holding.currency,
    Shares: row.holding.shares,
    'Avg Buy Price (Native)': roundTwo(row.holding.avgBuyPrice),
    'Live Price (Native)': roundTwo(row.livePriceNative),
    'Day Change %': row.quote ? roundTwo(row.quote.dayChangePercent) : 0,
    [`Live Value (${curr})`]: roundTwo(row.marketValueTarget),
    [`Cost Basis (${curr})`]: roundTwo(row.costBasisTarget),
    [`Unrealized P&L (${curr})`]: roundTwo(row.gainLossTarget),
    'Unrealized P&L %': roundTwo(row.gainLossPct),
    Notes: row.holding.notes,
  }));
  const stockSheet = XLSX.utils.json_to_sheet(
    stockSheetData.length > 0
      ? stockSheetData
      : [{ Symbol: 'No stock holdings recorded', Shares: 0 }],
  );
  stockSheet['!cols'] = [
    { wch: 16 },
    { wch: 26 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, stockSheet, 'Stocks (Live)');

  const cashSheetData = payload.cashAccounts.map((acc) => ({
    Account: acc.name,
    Type: ACCOUNT_TYPE_LABELS[acc.accountType],
    [`Balance (${curr})`]: roundTwo(acc.balance),
  }));
  const cashSheet = XLSX.utils.json_to_sheet(
    cashSheetData.length > 0 ? cashSheetData : [{ Account: 'No cash balances recorded', Balance: 0 }],
  );
  cashSheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, cashSheet, 'Cash Balances');

  const sortedExpenses = [...payload.expenses].sort((a, b) =>
    b.spentDate.localeCompare(a.spentDate),
  );
  const expenseSheetData = sortedExpenses.map((exp) => ({
    Date: exp.spentDate,
    Month: exp.monthKey,
    Item: exp.title,
    Category: EXPENSE_CATEGORY_LABELS[exp.category],
    Recurring: exp.isRecurring ? 'Yes' : 'No',
    [`Amount (${curr})`]: roundTwo(exp.amount),
  }));
  const expenseSheet = XLSX.utils.json_to_sheet(
    expenseSheetData.length > 0
      ? expenseSheetData
      : [{ Date: today, Item: 'No expenses logged', Amount: 0 }],
  );
  expenseSheet['!cols'] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Monthly Spending');

  const dealsSheetData = payload.deals.map((deal) => ({
    Title: deal.title,
    Counterparty: deal.counterparty || '-',
    Stage: DEAL_STAGE_LABELS[deal.stage],
    Priority: deal.priority === 'high' ? 'High' : 'Normal',
    [`Deal Value (${curr})`]: roundTwo(deal.dealValue),
    'Target Date': deal.targetDate || '-',
    Notes: deal.notes || '',
  }));
  const dealsSheet = XLSX.utils.json_to_sheet(
    dealsSheetData.length > 0
      ? dealsSheetData
      : [{ Title: 'No important deals stored', DealValue: 0 }],
  );
  dealsSheet['!cols'] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 14 },
    { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, dealsSheet, 'Important Deals');

  const agreementsSheetData = payload.agreements.map((agr) => ({
    Type: AGREEMENT_TYPE_LABELS[agr.agreementType],
    Lender: agr.lenderName,
    Receiver: agr.receiverName,
    [`Amount (${curr})`]: roundTwo(agr.amount),
    'Double Default Rule': agr.doublePenaltyOnDefault ? `Yes (${roundTwo(agr.amount * 2)})` : 'No',
    'Payment Mode': PAYMENT_MODE_LABELS[agr.paymentMode],
    'Ref / UTR': agr.paymentReference || '-',
    'Date Given': agr.agreementDate,
    'Due Date': agr.dueDate || '-',
    'Interest % p.a.': agr.interestRate,
    Status: AGREEMENT_STATUS_LABELS[agr.status],
    Signed: agr.lenderSignature || agr.receiverSignature ? 'Yes' : 'No',
    Clauses: agr.purposeAndClauses,
  }));
  const agreementsSheet = XLSX.utils.json_to_sheet(
    agreementsSheetData.length > 0
      ? agreementsSheetData
      : [{ Type: 'No money agreements recorded', Amount: 0 }],
  );
  agreementsSheet['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 20 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, agreementsSheet, 'Money Agreements');

  XLSX.writeFile(wb, `meridian-ledger-${today}.xlsx`);
}

export function exportToPdf(payload: LedgerExportPayload): void {
  const totals = computeTotals(payload);
  const curr = payload.preferredCurrency;
  const today = getTodayDateString();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Meridian Ledger — Financial Report', marginX, 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Owner: ${payload.ownerName}  |  Currency: ${curr}  |  Generated: ${new Date().toLocaleString()}`,
    marginX,
    64,
  );

  autoTable(doc, {
    startY: 80,
    margin: { left: marginX, right: marginX },
    head: [['Portfolio & Cash Summary', 'Value']],
    body: [
      ['Total Net Worth (Stocks + Cash)', formatPdfMoney(totals.totalNetWorth, curr)],
      [
        'Live Stock Portfolio Value',
        `${formatPdfMoney(totals.totalStockValue, curr)} (${formatPdfSignedMoney(totals.totalStockPnL, curr)} / ${formatPercent(totals.totalStockPnLPct)})`,
      ],
      ['Money on Hand (Cash Balances)', formatPdfMoney(totals.totalCash, curr)],
      [
        `Monthly Spend (${formatMonthLabel(payload.selectedMonth)})`,
        `${formatPdfMoney(totals.selectedMonthSpend, curr)} of ${formatPdfMoney(payload.monthlyBudget, curr)} budget`,
      ],
      [
        'Active Important Deals',
        `${formatPdfMoney(totals.activeDealsValue, curr)} (${totals.activeDealsCount} active)`,
      ],
      [
        'Active Money Agreements',
        `${formatPdfMoney(totals.activeAgreementsValue, curr)} (${totals.activeAgreementsCount} active)`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9.5 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const getNextY = () =>
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120) + 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Stock Portfolio (Live Valuation)', marginX, getNextY());

  autoTable(doc, {
    startY: getNextY() - 14,
    margin: { left: marginX, right: marginX },
    head: [['Ticker', 'Company', 'Shares', 'Live Price', `Value (${curr})`, `P&L (${curr})`]],
    body:
      totals.stockRows.length > 0
        ? totals.stockRows.map((row) => [
            row.holding.symbol,
            row.holding.companyName,
            formatShares(row.holding.shares),
            formatPdfMoney(row.livePriceNative, row.quote?.currency || row.holding.currency),
            formatPdfMoney(row.marketValueTarget, curr),
            `${formatPdfSignedMoney(row.gainLossTarget, curr)} (${formatPercent(row.gainLossPct)})`,
          ])
        : [['-', 'No stock holdings recorded', '-', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Money on Hand (Cash Accounts)', marginX, getNextY());

  autoTable(doc, {
    startY: getNextY() - 14,
    margin: { left: marginX, right: marginX },
    head: [['Account / Source', 'Type', `Balance (${curr})`]],
    body:
      payload.cashAccounts.length > 0
        ? payload.cashAccounts.map((acc) => [
            acc.name,
            ACCOUNT_TYPE_LABELS[acc.accountType],
            formatPdfMoney(acc.balance, curr),
          ])
        : [['No cash accounts recorded', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      2: { halign: 'right' },
    },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`3. Monthly Spending (${formatMonthLabel(payload.selectedMonth)})`, marginX, getNextY());

  autoTable(doc, {
    startY: getNextY() - 14,
    margin: { left: marginX, right: marginX },
    head: [['Date', 'Item / Merchant', 'Category', 'Recurring', `Amount (${curr})`]],
    body:
      totals.monthExpenses.length > 0
        ? totals.monthExpenses.map((exp) => [
            exp.spentDate,
            exp.title,
            EXPENSE_CATEGORY_LABELS[exp.category],
            exp.isRecurring ? 'Yes' : 'No',
            formatPdfMoney(exp.amount, curr),
          ])
        : [['-', `No expenses logged for ${formatMonthLabel(payload.selectedMonth)}`, '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      4: { halign: 'right' },
    },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Important Deals Vault', marginX, getNextY());

  autoTable(doc, {
    startY: getNextY() - 14,
    margin: { left: marginX, right: marginX },
    head: [['Deal Title', 'Counterparty', 'Stage', 'Priority', 'Target Date', `Value (${curr})`]],
    body:
      payload.deals.length > 0
        ? payload.deals.map((d) => [
            d.title,
            d.counterparty || '-',
            DEAL_STAGE_LABELS[d.stage],
            d.priority === 'high' ? 'High' : 'Normal',
            d.targetDate || '-',
            formatPdfMoney(d.dealValue, curr),
          ])
        : [['No important deals stored', '-', '-', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      5: { halign: 'right' },
    },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Money Agreements', marginX, getNextY());

  autoTable(doc, {
    startY: getNextY() - 14,
    margin: { left: marginX, right: marginX },
    head: [['Type', 'Receiver', 'Due Date', '2x Rule', 'Status', `Amount (${curr})`]],
    body:
      payload.agreements.length > 0
        ? payload.agreements.map((a) => [
            AGREEMENT_TYPE_LABELS[a.agreementType],
            a.receiverName,
            a.dueDate || '-',
            a.doublePenaltyOnDefault ? '2x Active' : 'No',
            AGREEMENT_STATUS_LABELS[a.status],
            formatPdfMoney(a.amount, curr),
          ])
        : [['No money agreements recorded', '-', '-', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: {
      5: { halign: 'right' },
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Meridian Ledger  |  Page ${i} of ${totalPages}`,
      pageWidth - marginX,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' },
    );
  }

  doc.save(`meridian-ledger-${today}.pdf`);
}

export function exportAgreementPdf(agreement: MoneyAgreement, currency: CurrencyCode): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;
  const title = AGREEMENT_TYPE_LABELS[agreement.agreementType].toUpperCase();
  const amountFigures = formatPdfMoney(agreement.amount, currency);
  const amountWords = numberToMoneyWords(agreement.amount, currency);
  const doubleAmountFigures = formatPdfMoney(agreement.amount * 2, currency);
  const doubleAmountWords = numberToMoneyWords(agreement.amount * 2, currency);

  // Header Banner
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.5);
  doc.line(marginX, 46, pageWidth - marginX, 46);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(title, pageWidth / 2, 70, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const refCode = `AGR-${agreement.id.slice(0, 8).toUpperCase()}`;
  const placeText = agreement.jurisdiction ? `  |  Place: ${agreement.jurisdiction}` : '';
  doc.text(
    `Ref: ${refCode}  |  Execution Date: ${agreement.agreementDate}${placeText}`,
    pageWidth / 2,
    88,
    { align: 'center' },
  );

  doc.setLineWidth(0.75);
  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, 100, pageWidth - marginX, 100);

  let y = 120;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  const introText = `This ${AGREEMENT_TYPE_LABELS[agreement.agreementType]} ("Agreement") is made and executed on ${agreement.agreementDate}${agreement.jurisdiction ? ` at ${agreement.jurisdiction}` : ''} between:`;
  const introLines = doc.splitTextToSize(introText, contentWidth);
  doc.text(introLines, marginX, y);
  y += introLines.length * 15 + 10;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['First Party (Payer / Lender)', 'Second Party (Receiver / Borrower)']],
    body: [
      [
        `${agreement.lenderName}\n(Hereinafter referred to as the "First Party")`,
        `${agreement.receiverName}${agreement.receiverDetails ? `\n${agreement.receiverDetails}` : ''}\n(Hereinafter referred to as the "Second Party")`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5, textColor: [30, 41, 59], cellPadding: 8 },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 16;

  const particularsBody: Array<[string, string]> = [
    ['Principal Amount (in Figures)', amountFigures],
    ['Principal Amount (in Words)', amountWords],
  ];

  if (agreement.doublePenaltyOnDefault) {
    particularsBody.push([
      'Default Liability (If Unpaid)',
      `DOUBLE (2x): ${doubleAmountFigures} (${doubleAmountWords})`,
    ]);
  }

  particularsBody.push(
    ['Payment Mode', PAYMENT_MODE_LABELS[agreement.paymentMode]],
    ['Transaction / Ref / UTR No.', agreement.paymentReference || 'N/A'],
    [
      'Interest / Return Rate',
      agreement.interestRate > 0 ? `${agreement.interestRate}% per annum` : '0% (Interest-Free)',
    ],
    ['Repayment Schedule', REPAYMENT_TERMS_LABELS[agreement.repaymentTerms]],
    ['Due / Settlement Date', agreement.dueDate || 'As mutually agreed / On demand'],
    ['Current Status', AGREEMENT_STATUS_LABELS[agreement.status]],
  );

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Financial & Payment Particulars', 'Details']],
    body: particularsBody,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9.5 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59], cellPadding: 5.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 185 },
    },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Terms, Rules & Covenants', marginX, y);
  y += 16;

  let idx = 1;
  const clauses: string[] = [
    `${idx++}. Receipt of Funds: The Second Party (${agreement.receiverName}) hereby acknowledges receipt of ${amountFigures} (${amountWords}) paid by the First Party (${agreement.lenderName}) via ${PAYMENT_MODE_LABELS[agreement.paymentMode]}${agreement.paymentReference ? ` (Ref: ${agreement.paymentReference})` : ''} on ${agreement.agreementDate}.`,
    `${idx++}. Repayment & Settlement Obligation: The Second Party undertakes to repay or settle the principal sum${agreement.interestRate > 0 ? ` together with interest at ${agreement.interestRate}% per annum` : ''} under the terms "${REPAYMENT_TERMS_LABELS[agreement.repaymentTerms]}"${agreement.dueDate ? ` on or before ${agreement.dueDate}` : ''}.`,
  ];

  if (agreement.doublePenaltyOnDefault) {
    clauses.push(
      `${idx++}. Double Amount Default Rule (2x Penalty): If the Second Party fails to repay the owed sum on or before ${agreement.dueDate || 'the stipulated due date'}, the total payable liability shall automatically become DOUBLE (2x) the Principal Amount, amounting to ${doubleAmountFigures} (${doubleAmountWords}), immediately payable by the Second Party.`,
    );
  }

  for (const ruleId of agreement.selectedRules ?? []) {
    if (ruleId in AGREEMENT_RULE_CATALOG) {
      const rule = AGREEMENT_RULE_CATALOG[ruleId as AgreementRuleId];
      clauses.push(`${idx++}. ${rule.label}: ${rule.clause}`);
    }
  }

  clauses.push(
    `${idx++}. Purpose & Special Terms: ${agreement.purposeAndClauses || 'Funds are extended in good faith for lawful personal or business purposes as mutually agreed between the parties.'}`,
    `${idx++}. Governing Law & Binding Effect: This Agreement constitutes a valid and binding acknowledgment of debt/payment between the Parties${agreement.jurisdiction ? ` under the jurisdiction of ${agreement.jurisdiction}` : ''}.`,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  for (const clause of clauses) {
    const lines = doc.splitTextToSize(clause, contentWidth);
    if (y + lines.length * 13 > 730) {
      doc.addPage();
      y = 54;
    }
    doc.text(lines, marginX, y);
    y += lines.length * 13 + 7;
  }

  // Signature Block
  if (y + 135 > 780) {
    doc.addPage();
    y = 60;
  } else {
    y += 14;
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 22;

  const col1X = marginX;
  const col2X = pageWidth / 2 + 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('FIRST PARTY (LENDER / PAYER)', col1X, y);
  doc.text('SECOND PARTY (RECEIVER / BORROWER)', col2X, y);

  y += 10;
  if (agreement.lenderSignature && agreement.lenderSignature.startsWith('data:image/png')) {
    try {
      doc.addImage(agreement.lenderSignature, 'PNG', col1X, y, 130, 39);
    } catch {
      // Fallback to blank signature space
    }
  }
  if (agreement.receiverSignature && agreement.receiverSignature.startsWith('data:image/png')) {
    try {
      doc.addImage(agreement.receiverSignature, 'PNG', col2X, y, 130, 39);
    } catch {
      // Fallback to blank signature space
    }
  }

  y += 46;
  doc.setDrawColor(71, 85, 105);
  doc.line(col1X, y, col1X + 190, y);
  doc.line(col2X, y, col2X + 190, y);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Name: ${agreement.lenderName}`, col1X, y);
  doc.text(`Name: ${agreement.receiverName}`, col2X, y);

  y += 14;
  doc.text(`Date: ${agreement.agreementDate}`, col1X, y);
  doc.text('Date: ______________________', col2X, y);

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('WITNESS SIGNATURE & NAME:', col1X, y);
  doc.setDrawColor(148, 163, 184);
  doc.line(col1X + 150, y + 2, pageWidth - marginX, y + 2);

  const safeReceiver =
    agreement.receiverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'party';
  doc.save(`money-agreement-${safeReceiver}-${agreement.agreementDate}.pdf`);
}
