import { describe, it, expect } from 'vitest'
import { transformTransaction } from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/transaction'
import type {
  CashCtrlJournal,
  CashCtrlJournalItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/journal'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeJournal(overrides: Partial<CashCtrlJournal> = {}): CashCtrlJournal {
  return {
    id: 800,
    dateAdded: '2025-09-01',
    title: 'Customer payment',
    reference: 'INV-5001',
    currencyCode: 'CHF',
    amount: 1000,
    debitId: 1000,
    creditId: 3000,
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlJournalItem> = {}): CashCtrlJournalItem {
  return {
    id: 1,
    accountId: 4000,
    description: 'Payment line',
    debit: 500,
    credit: 0,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id to string', () => {
    expect(transformTransaction(makeJournal({ id: 55 })).id).toBe('55')
  })

  it('maps debitId to accountId as string', () => {
    expect(transformTransaction(makeJournal({ debitId: 1100 })).accountId).toBe('1100')
  })

  it('maps creditId to splitAccountId as string', () => {
    expect(transformTransaction(makeJournal({ creditId: 2200 })).splitAccountId).toBe('2200')
  })

  it('maps null debitId to undefined accountId', () => {
    expect(transformTransaction(makeJournal({ debitId: null })).accountId).toBeUndefined()
  })

  it('maps null creditId to undefined splitAccountId', () => {
    expect(transformTransaction(makeJournal({ creditId: null })).splitAccountId).toBeUndefined()
  })

  it('maps reference', () => {
    expect(transformTransaction(makeJournal({ reference: 'PAY-123' })).reference).toBe('PAY-123')
  })

  it('maps title to memo', () => {
    expect(transformTransaction(makeJournal({ title: 'Rent' })).memo).toBe('Rent')
  })

  it('maps currencyCode to currency', () => {
    expect(transformTransaction(makeJournal({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeJournal({ amount: 750 })).totalAmount).toBe(750)
  })

  it('maps dateAdded to createdAt as Date', () => {
    expect(transformTransaction(makeJournal({ dateAdded: '2025-11-15' })).createdAt).toEqual(
      new Date('2025-11-15'),
    )
  })

  it('leaves createdAt undefined when dateAdded is null', () => {
    expect(transformTransaction(makeJournal({ dateAdded: null })).createdAt).toBeUndefined()
  })

  // Simple entry lineItems (debitId/creditId)
  describe('simple entry (debitId/creditId)', () => {
    it('produces two lineItems for a simple entry', () => {
      const result = transformTransaction(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 500, items: null }),
      )
      expect(result.lineItems).toHaveLength(2)
    })

    it('debit lineitem uses debitId as accountId', () => {
      const result = transformTransaction(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 500, items: null }),
      )
      expect(result.lineItems![0]!.accountId).toBe('1000')
      expect(result.lineItems![0]!.totalAmount).toBe(500)
    })

    it('credit lineitem uses creditId as accountId', () => {
      const result = transformTransaction(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 500, items: null }),
      )
      expect(result.lineItems![1]!.accountId).toBe('2000')
      expect(result.lineItems![1]!.totalAmount).toBe(500)
    })

    it('simple lineItems use title as description', () => {
      const result = transformTransaction(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 100, title: 'Fee', items: null }),
      )
      expect(result.lineItems![0]!.description).toBe('Fee')
      expect(result.lineItems![1]!.description).toBe('Fee')
    })
  })

  // Collective entry lineItems (items array)
  describe('collective entry (items array)', () => {
    it('maps items to lineItems', () => {
      const result = transformTransaction(
        makeJournal({ items: [makeItem()], debitId: null, creditId: null }),
      )
      expect(result.lineItems).toHaveLength(1)
    })

    it('maps item id to lineitem id as string', () => {
      const result = transformTransaction(
        makeJournal({ items: [makeItem({ id: 77 })], debitId: null, creditId: null }),
      )
      expect(result.lineItems![0]!.id).toBe('77')
    })

    it('maps item accountId to lineitem accountId as string', () => {
      const result = transformTransaction(
        makeJournal({ items: [makeItem({ accountId: 4500 })], debitId: null, creditId: null }),
      )
      expect(result.lineItems![0]!.accountId).toBe('4500')
    })

    it('maps item description to lineitem description', () => {
      const result = transformTransaction(
        makeJournal({
          items: [makeItem({ description: 'Line desc' })],
          debitId: null,
          creditId: null,
        }),
      )
      expect(result.lineItems![0]!.description).toBe('Line desc')
    })

    it('uses debit as totalAmount when debit is non-zero', () => {
      const result = transformTransaction(
        makeJournal({
          items: [makeItem({ debit: 200, credit: 0 })],
          debitId: null,
          creditId: null,
        }),
      )
      expect(result.lineItems![0]!.totalAmount).toBe(200)
    })

    it('uses credit as totalAmount when debit is zero', () => {
      const result = transformTransaction(
        makeJournal({
          items: [makeItem({ debit: 0, credit: 350 })],
          debitId: null,
          creditId: null,
        }),
      )
      expect(result.lineItems![0]!.totalAmount).toBe(350)
    })
  })

  it('leaves lineItems undefined when no items and no debitId/creditId', () => {
    const result = transformTransaction(makeJournal({ items: null, debitId: null, creditId: null }))
    expect(result.lineItems).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('output passes schema validation (simple)', () => {
    expect(() =>
      TransactionSchema.parse(
        transformTransaction(
          makeJournal({ debitId: 1000, creditId: 2000, amount: 500, items: null }),
        ),
      ),
    ).not.toThrow()
  })

  it('output passes schema validation (collective)', () => {
    expect(() =>
      TransactionSchema.parse(
        transformTransaction(makeJournal({ items: [makeItem()], debitId: null, creditId: null })),
      ),
    ).not.toThrow()
  })
})
