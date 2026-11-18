import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type XeroBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/transaction'

function makeTransaction(overrides: Partial<XeroBankTransaction> = {}): XeroBankTransaction {
  return {
    BankTransactionID: 'bt-001',
    Type: 'SPEND',
    Contact: { ContactID: 'cid-1', Name: 'Office Supplies Ltd' },
    BankAccount: { AccountID: 'bank-001', Code: '090' },
    DateString: '2024-03-10',
    Total: 1200,
    TotalTax: 200,
    CurrencyCode: 'GBP',
    Reference: 'REF-001',
    IsReconciled: false,
    Status: 'AUTHORISED',
    LineItems: [
      {
        Description: 'Stationery',
        UnitAmount: 1000,
        Quantity: 1,
        LineAmount: 1000,
        AccountCode: '420',
        AccountID: 'acc-guid-420',
      },
    ],
    ...overrides,
  }
}

describe('transformTransaction (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('bt-001')
    expect(result.accountId).toBe('bank-001')
    expect(result.type).toBe('SPEND')
    expect(result.reference).toBe('REF-001')
    expect(result.totalAmount).toBe(120000)
    expect(result.taxAmount).toBe(20000)
    expect(result.currency).toBe('GBP')
  })

  it('maps contact into contacts array', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cid-1')
    expect(result.contacts![0].name).toBe('Office Supplies Ltd')
  })

  it('maps line items correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.description).toBe('Stationery')
    expect(li.unitAmount).toBe(100000)
    expect(li.unitQuantity).toBe(1)
    expect(li.totalAmount).toBe(100000)
    expect(li.accountId).toBe('acc-guid-420')
    expect(li.accountCode).toBe('420')
  })

  it('carries LineItemID as the line id, through the canonical schema', () => {
    // Transaction lines were the only ones in the vertical with no id: Xero
    // supplies LineItemID, the transform never mapped it.
    const raw = makeTransaction()
    raw.LineItems[0].LineItemID = 'li-guid-1'
    const parsed = TransactionSchema.parse(transformTransaction(raw))
    expect(parsed.lineItems![0].id).toBe('li-guid-1')
    // Absent stays absent rather than becoming an empty string.
    expect(transformTransaction(makeTransaction()).lineItems![0].id).toBeUndefined()
  })

  it('maps the transaction date to postedAt as a calendar date', () => {
    // Previously this fed `createdAt` a fabricated instant. The modelling
    // question flagged when Finding 12 was fixed turned out to be the bug
    // Finding 28 reported: `DateString` is when the transaction was POSTED,
    // and it is a date, not a moment.
    expect(transformTransaction(makeTransaction()).postedAt).toBe('2024-03-10')
    expect(transformTransaction(makeTransaction()).createdAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
