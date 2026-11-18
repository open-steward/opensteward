import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import { mapLineAmountTypes, toUtcDate, toMinorUnits , toCalendarDate} from '../../shared/transform'
import type { XeroBankTransaction } from './transaction'

/**
 * Xero has no reachable expense-claim entity, so an expense here is a
 * **spend-money bank transaction** — `BankTransactions` with `Type` starting
 * `SPEND`.
 *
 * That is the same modelling every peer adapter uses: QuickBooks maps this
 * resource to `Purchase`, FreshBooks and ZohoBooks to their vendor-and-amount
 * expense records. The canonical Expense is a spend record, not a
 * reimbursement claim — `userId` / `approverUserId` / `reimbursedAmount` are
 * optional precisely because only expense-claim platforms fill them.
 *
 * This file previously targeted `ExpenseClaims`, which was unreachable: that
 * endpoint needs `accounting.transactions`, and a Xero app created on or after
 * 2026-03-02 cannot request it (verified live — Xero rejects the authorize
 * request outright). `BankTransactions` needs only
 * `accounting.banktransactions.read`, which read-only links already carry.
 *
 * Deliberately overlaps `transactions`, which lists every bank transaction.
 * The overlap is incidental rather than structural: `transactions` is all
 * types, `expenses` is the SPEND subset, and the two differ on any org with
 * money coming in.
 */
function mapLineItems(raw: XeroBankTransaction): Lineitem[] | null {
  // `null`, not `[]`, when Xero omitted the collection — the canonical field
  // is `nullish`, and "the platform said nothing" is not "the platform said
  // there are none". See scripts/check-collection-null-policy.ts.
  if (!Array.isArray(raw.LineItems)) return null
  return raw.LineItems.map((li) => ({
    accountId: li.AccountID || undefined,
    accountCode: li.AccountCode || undefined,
    itemDescription: li.Description || undefined,
    unitAmount: toMinorUnits(li.UnitAmount),
    unitQuantity: li.Quantity,
    totalAmount: toMinorUnits(li.LineAmount),
  }))
}

export function transformExpense(raw: XeroBankTransaction): Expense {
  return {
    id: raw.BankTransactionID,
    // The vendor paid, and the account paid from. Xero ids are used bare on
    // both sides of this adapter — `transform/contact.ts` emits `ContactID`
    // unprefixed — so an equality join against contacts resolves.
    contactId: raw.Contact?.ContactID || undefined,
    name: raw.Reference || undefined,
    accountId: raw.BankAccount?.AccountID || undefined,
    currency: raw.CurrencyCode || undefined,
    taxAmount: toMinorUnits(raw.TotalTax || undefined),
    totalAmount: toMinorUnits(raw.Total),
    lineAmountsIncludeTax: mapLineAmountTypes(raw.LineAmountTypes),
    lineItems: mapLineItems(raw),
    postedAt: toCalendarDate(raw.DateString),
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
