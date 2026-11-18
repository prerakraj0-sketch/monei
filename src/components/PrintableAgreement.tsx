import { AgreementRuleId, CurrencyCode, MoneyAgreement } from '../types';
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  formatMoney,
  numberToMoneyWords,
  PAYMENT_MODE_LABELS,
  REPAYMENT_TERMS_LABELS,
} from '../lib/formatters';

export const AGREEMENT_RULE_CATALOG: Record<
  AgreementRuleId,
  { label: string; clause: string }
> = {
  [AgreementRuleId.NO_SETOFF]: {
    label: 'Unconditional Repayment (No Set-Off)',
    clause:
      'All repayments shall be made in full without any deduction, withholding, counterclaim, or set-off of any kind.',
  },
  [AgreementRuleId.GRACE_NOTICE]: {
    label: '7-Day Written Default Notice',
    clause:
      'If payment is delayed beyond the due date, a 7-day written or digital demand notice shall be treated as final formal notice before enforcement.',
  },
  [AgreementRuleId.LEGAL_RECOVERY_COSTS]: {
    label: 'Legal & Recovery Costs on Borrower',
    clause:
      'In the event of default, all reasonable legal fees, court costs, notice charges, and recovery expenses incurred by the First Party shall be borne solely by the Second Party.',
  },
  [AgreementRuleId.DISHONOUR_PENALTY]: {
    label: 'Cheque / UPI Dishonour Liability',
    clause:
      'Any dishonoured cheque or failed/reversed electronic payment issued toward repayment shall constitute an actionable default under applicable financial laws.',
  },
  [AgreementRuleId.COLLATERAL_SECURITY]: {
    label: 'Personal Guarantee & Asset Responsibility',
    clause:
      'The Second Party affirms personal and binding liability for the owed sum and confirms no misrepresentation of identity or repayment capacity.',
  },
  [AgreementRuleId.WITNESS_ATTESTATION]: {
    label: 'Witness Attestation & Acknowledgment',
    clause:
      'This document is executed voluntarily without coercion and may be attested by witnesses or electronic signature records.',
  },
};

interface PrintableAgreementProps {
  agreement: MoneyAgreement;
  currency: CurrencyCode;
}

export function PrintableAgreement({ agreement, currency }: PrintableAgreementProps) {
  const doubleAmount = agreement.amount * 2;
  const activeRules = (agreement.selectedRules ?? []).filter(
    (id): id is AgreementRuleId => id in AGREEMENT_RULE_CATALOG,
  );

  let clauseNumber = 1;

  return (
    <div className="hidden print:block bg-white text-slate-900 p-8 max-w-3xl mx-auto text-sm leading-relaxed">
      <div className="border-t-2 border-slate-900 pt-5 pb-4 border-b border-slate-300 text-center space-y-1">
        <h1 className="text-xl font-bold uppercase tracking-wide">
          {AGREEMENT_TYPE_LABELS[agreement.agreementType]}
        </h1>
        <p className="text-xs text-slate-600 font-mono">
          Ref: AGR-{agreement.id.slice(0, 8).toUpperCase()} · Execution Date: {agreement.agreementDate}
          {agreement.jurisdiction ? ` · Place: ${agreement.jurisdiction}` : ''}
        </p>
      </div>

      <p className="mt-5">
        This {AGREEMENT_TYPE_LABELS[agreement.agreementType]} (&ldquo;Agreement&rdquo;) is executed on{' '}
        <strong>{agreement.agreementDate}</strong>
        {agreement.jurisdiction ? ` at ${agreement.jurisdiction}` : ''} between:
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 border border-slate-300 rounded-lg p-4">
        <div>
          <div className="text-xs font-bold uppercase text-slate-500">First Party (Lender / Payer)</div>
          <div className="font-semibold mt-1">{agreement.lenderName}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-slate-500">Second Party (Receiver / Borrower)</div>
          <div className="font-semibold mt-1">{agreement.receiverName}</div>
          {agreement.receiverDetails && (
            <div className="text-xs text-slate-600 mt-0.5">{agreement.receiverDetails}</div>
          )}
        </div>
      </div>

      <table className="w-full mt-5 border-collapse border border-slate-300 text-xs">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="p-2.5 font-semibold bg-slate-50 w-52">Principal Amount (Figures)</td>
            <td className="p-2.5 font-mono font-bold">{formatMoney(agreement.amount, currency)}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2.5 font-semibold bg-slate-50">Principal Amount (Words)</td>
            <td className="p-2.5">{numberToMoneyWords(agreement.amount, currency)}</td>
          </tr>
          {agreement.doublePenaltyOnDefault && (
            <tr className="border-b border-slate-200 bg-red-50/40">
              <td className="p-2.5 font-semibold text-red-800">Default Liability (2x Double Rule)</td>
              <td className="p-2.5 font-mono font-bold text-red-800">
                {formatMoney(doubleAmount, currency)} ({numberToMoneyWords(doubleAmount, currency)})
              </td>
            </tr>
          )}
          <tr className="border-b border-slate-200">
            <td className="p-2.5 font-semibold bg-slate-50">Payment Mode &amp; Ref</td>
            <td className="p-2.5">
              {PAYMENT_MODE_LABELS[agreement.paymentMode]}
              {agreement.paymentReference ? ` (Ref: ${agreement.paymentReference})` : ''}
            </td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2.5 font-semibold bg-slate-50">Interest / Return Rate</td>
            <td className="p-2.5">
              {agreement.interestRate > 0 ? `${agreement.interestRate}% per annum` : '0% (Interest-Free)'}
            </td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2.5 font-semibold bg-slate-50">Repayment Terms &amp; Due Date</td>
            <td className="p-2.5">
              {REPAYMENT_TERMS_LABELS[agreement.repaymentTerms]} · Due:{' '}
              {agreement.dueDate || 'On demand / As agreed'}
            </td>
          </tr>
          <tr>
            <td className="p-2.5 font-semibold bg-slate-50">Status</td>
            <td className="p-2.5">{AGREEMENT_STATUS_LABELS[agreement.status]}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6 space-y-2.5 text-xs">
        <h2 className="text-sm font-bold text-slate-900">Terms, Rules &amp; Covenants</h2>
        <p>
          <strong>{clauseNumber++}. Receipt Confirmation:</strong> The Second Party ({agreement.receiverName}) confirms receipt of{' '}
          {formatMoney(agreement.amount, currency)} ({numberToMoneyWords(agreement.amount, currency)}) from the First Party ({agreement.lenderName}) on {agreement.agreementDate}.
        </p>
        <p>
          <strong>{clauseNumber++}. Repayment Obligation:</strong> The Second Party agrees to repay the principal amount
          {agreement.interestRate > 0 ? ` along with ${agreement.interestRate}% p.a. interest` : ''} via{' '}
          {REPAYMENT_TERMS_LABELS[agreement.repaymentTerms]}
          {agreement.dueDate ? ` on or before ${agreement.dueDate}` : ''}.
        </p>
        {agreement.doublePenaltyOnDefault && (
          <p className="font-semibold text-red-900">
            <strong>{clauseNumber++}. Double Amount Default Rule (2x Penalty):</strong> If the Second Party fails to repay the agreed sum on or before{' '}
            {agreement.dueDate || 'the stipulated due date'}, the total payable liability shall automatically become DOUBLE (2x) the Principal Amount, equal to{' '}
            {formatMoney(doubleAmount, currency)} ({numberToMoneyWords(doubleAmount, currency)}), immediately recoverable from the Second Party.
          </p>
        )}
        {activeRules.map((ruleId) => (
          <p key={ruleId}>
            <strong>
              {clauseNumber++}. {AGREEMENT_RULE_CATALOG[ruleId].label}:
            </strong>{' '}
            {AGREEMENT_RULE_CATALOG[ruleId].clause}
          </p>
        ))}
        {agreement.purposeAndClauses && (
          <p>
            <strong>{clauseNumber++}. Purpose &amp; Custom Terms:</strong> {agreement.purposeAndClauses}
          </p>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-slate-300 grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="font-bold uppercase text-slate-700 mb-2">First Party (Lender / Payer)</div>
          <div className="h-20 flex items-end border-b border-slate-400 pb-1">
            {agreement.lenderSignature ? (
              <img
                src={agreement.lenderSignature}
                alt={`${agreement.lenderName} signature`}
                className="max-h-16 object-contain"
              />
            ) : (
              <span className="text-slate-400 italic">Signature</span>
            )}
          </div>
          <div className="mt-1.5">Name: {agreement.lenderName}</div>
          <div>Date: {agreement.agreementDate}</div>
        </div>

        <div>
          <div className="font-bold uppercase text-slate-700 mb-2">Second Party (Receiver / Borrower)</div>
          <div className="h-20 flex items-end border-b border-slate-400 pb-1">
            {agreement.receiverSignature ? (
              <img
                src={agreement.receiverSignature}
                alt={`${agreement.receiverName} signature`}
                className="max-h-16 object-contain"
              />
            ) : (
              <span className="text-slate-400 italic">Signature</span>
            )}
          </div>
          <div className="mt-1.5">Name: {agreement.receiverName}</div>
          <div>Date: ______________________</div>
        </div>
      </div>

      <div className="mt-8 text-xs">
        <span className="font-bold uppercase text-slate-700">Witness Name &amp; Signature:</span>
        <span className="inline-block border-b border-slate-400 w-80 ml-3 align-bottom" />
      </div>
    </div>
  );
}
