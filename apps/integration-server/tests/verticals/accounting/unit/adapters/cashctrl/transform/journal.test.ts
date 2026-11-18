import { describe, it, expect } from 'vitest'
import {
  transformJournal,
  type CashCtrlJournal,
  type CashCtrlJournalItem,
} from '../../../../../../../src/verticals/accounting/adapters/cashctrl/transform/journal'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'

function makeJournal(overrides: Partial<CashCtrlJournal> = {}): CashCtrlJournal {
  return {
    id: 500,
    dateAdded: '2025-03-01',
    title: 'Sales recognition',
    reference: 'INV-1042',
    currencyCode: 'CHF',
    ...overrides,
  }
}

function makeItem(overrides: Partial<CashCtrlJournalItem> = {}): CashCtrlJournalItem {
  return {
    id: 1,
    accountId: 4000,
    description: 'Revenue line',
    debit: 500,
    credit: 0,
    taxAmount: 39,
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeJournal({ id: 77 })).id).toBe('77')
  })

  it('maps title to description', () => {
    expect(transformJournal(makeJournal({ title: 'Accrual' })).description).toBe('Accrual')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal({ reference: 'REF-001' })).reference).toBe('REF-001')
  })

  it('maps currencyCode to currency', () => {
    expect(transformJournal(makeJournal({ currencyCode: 'EUR' })).currency).toBe('EUR')
  })

  it('maps dateAdded to postedAt as Date', () => {
    expect(transformJournal(makeJournal({ dateAdded: '2025-06-01' })).postedAt).toEqual(
      new Date('2025-06-01'),
    )
  })

  it('leaves postedAt undefined when dateAdded is null', () => {
    expect(transformJournal(makeJournal({ dateAdded: null })).postedAt).toBeUndefined()
  })

  // Collective entry (items array)
  describe('collective entry (items array)', () => {
    it('builds lineItems from items array', () => {
      const result = transformJournal(makeJournal({ items: [makeItem()] }))
      expect(result.lineItems).toHaveLength(1)
    })

    it('maps item id to lineitem id as string', () => {
      const result = transformJournal(makeJournal({ items: [makeItem({ id: 9 })] }))
      expect(result.lineItems![0]!.id).toBe('9')
    })

    it('maps item accountId to lineitem accountId as string', () => {
      const result = transformJournal(makeJournal({ items: [makeItem({ accountId: 1100 })] }))
      expect(result.lineItems![0]!.accountId).toBe('1100')
    })

    it('maps item description to lineitem description', () => {
      const result = transformJournal(
        makeJournal({ items: [makeItem({ description: 'Accrual entry' })] }),
      )
      expect(result.lineItems![0]!.description).toBe('Accrual entry')
    })

    it('maps item debit to lineitem debitAmount', () => {
      const result = transformJournal(makeJournal({ items: [makeItem({ debit: 750 })] }))
      expect(result.lineItems![0]!.debitAmount).toBe(750)
    })

    it('maps item credit to lineitem creditAmount', () => {
      const result = transformJournal(makeJournal({ items: [makeItem({ credit: 750 })] }))
      expect(result.lineItems![0]!.creditAmount).toBe(750)
    })

    it('maps item taxAmount to lineitem taxAmount', () => {
      const result = transformJournal(makeJournal({ items: [makeItem({ taxAmount: 57.75 })] }))
      expect(result.lineItems![0]!.taxAmount).toBe(57.75)
    })
  })

  // Simple entry (debitId/creditId)
  describe('simple entry (debitId/creditId)', () => {
    it('builds two synthetic lineItems for a simple entry', () => {
      const result = transformJournal(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 300, items: null }),
      )
      expect(result.lineItems).toHaveLength(2)
    })

    it('debit lineitem has debitId accountId', () => {
      const result = transformJournal(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 300, items: null }),
      )
      expect(result.lineItems![0]!.accountId).toBe('1000')
      expect(result.lineItems![0]!.debitAmount).toBe(300)
    })

    it('credit lineitem has creditId accountId', () => {
      const result = transformJournal(
        makeJournal({ debitId: 1000, creditId: 2000, amount: 300, items: null }),
      )
      expect(result.lineItems![1]!.accountId).toBe('2000')
      expect(result.lineItems![1]!.creditAmount).toBe(300)
    })

    it('simple entry lineItems use title as description', () => {
      const result = transformJournal(
        makeJournal({
          debitId: 1000,
          creditId: 2000,
          amount: 100,
          title: 'Rent payment',
          items: null,
        }),
      )
      expect(result.lineItems![0]!.description).toBe('Rent payment')
      expect(result.lineItems![1]!.description).toBe('Rent payment')
    })
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('output passes schema validation (collective)', () => {
    expect(() =>
      JournalSchema.parse(transformJournal(makeJournal({ items: [makeItem()] }))),
    ).not.toThrow()
  })

  it('output passes schema validation (simple)', () => {
    expect(() =>
      JournalSchema.parse(
        transformJournal(makeJournal({ debitId: 1000, creditId: 2000, amount: 500, items: null })),
      ),
    ).not.toThrow()
  })
})
