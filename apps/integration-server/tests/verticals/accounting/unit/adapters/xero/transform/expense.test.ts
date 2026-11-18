/**
 * A Xero expense is a spend-money bank transaction.
 *
 * This transform used to target `ExpenseClaims`, and nothing could ever call
 * it: that endpoint needs `accounting.transactions`, and a Xero app created on
 * or after 2026-03-02 cannot request that scope — Xero rejects the authorize
 * request outright. `expenses` therefore reported `skipped` on every sync while
 * the org's spend sat in `BankTransactions`, reachable under a scope read-only
 * links already carry.
 *
 * The canonical Expense is a spend record, not a reimbursement claim — which
 * is why QuickBooks maps it to `Purchase` and FreshBooks/ZohoBooks to their
 * vendor-and-amount records, and why `userId`/`approverUserId`/
 * `reimbursedAmount` are optional.
 */
import { describe, it, expect } from 'vitest'
import { ExpenseSchema } from '../../../../../../../src/verticals/accounting/schema/expense'
import { transformExpense } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/expense'
import type { XeroBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/transaction'

function makeSpend(overrides: Partial<XeroBankTransaction> = {}): XeroBankTransaction {
  return {
    BankTransactionID: 'bt-900',
    Type: 'SPEND',
    Contact: { ContactID: 'cid-7', Name: 'Office Supplies Ltd' },
    BankAccount: { AccountID: 'bank-001', Code: '090' },
    DateString: '2024-03-10',
    Total: 1200,
    TotalTax: 200,
    CurrencyCode: 'GBP',
    Reference: 'Stationery run',
    IsReconciled: false,
    Status: 'AUTHORISED',
    LineItems: [
      { Description: 'Stationery', UnitAmount: 1000, Quantity: 1, LineAmount: 1000, AccountCode: '420', AccountID: 'acc-guid-420' },
    ],
    ...overrides,
  }
}

describe('transformExpense', () => {
  it('uses the bank transaction id', () => {
    expect(transformExpense(makeSpend()).id).toBe('bt-900')
  })

  it('resolves the vendor as contactId, bare so an equality join works', () => {
    // Xero ids are unprefixed on both sides of this adapter — transform/contact
    // emits ContactID as-is — so a prefix here would dangle.
    expect(transformExpense(makeSpend()).contactId).toBe('cid-7')
  })

  it('maps the bank account the money left', () => {
    expect(transformExpense(makeSpend()).accountId).toBe('bank-001')
  })

  it('converts money to minor units', () => {
    const e = transformExpense(makeSpend())
    expect(e.totalAmount).toBe(120000)
    expect(e.taxAmount).toBe(20000)
  })

  it('maps line items with minor-unit amounts', () => {
    const lines = transformExpense(makeSpend()).lineItems!
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      accountId: 'acc-guid-420',
      accountCode: '420',
      itemDescription: 'Stationery',
      unitAmount: 100000,
      unitQuantity: 1,
      totalAmount: 100000,
    })
  })

  it('reports a missing collection as null, not as an empty one', () => {
    // `[]` asserts "this expense has no lines", which is a different claim from
    // "Xero did not send any". See scripts/check-collection-null-policy.ts.
    const e = transformExpense(makeSpend({ LineItems: undefined as never }))
    expect(e.lineItems).toBeNull()
  })

  it('keeps an explicitly empty collection empty', () => {
    expect(transformExpense(makeSpend({ LineItems: [] })).lineItems).toEqual([])
  })

  it('maps the date to postedAt', () => {
    expect(transformExpense(makeSpend()).postedAt).toBe('2024-03-10')
  })

  it('passes the raw object as metadata', () => {
    const raw = makeSpend()
    expect(transformExpense(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    expect(() => ExpenseSchema.parse(transformExpense(makeSpend()))).not.toThrow()
  })

  it('satisfies the schema for the overpayment and prepayment spend types too', () => {
    for (const Type of ['SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT']) {
      expect(() => ExpenseSchema.parse(transformExpense(makeSpend({ Type })))).not.toThrow()
    }
  })
})
