import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FAJournal } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/journal'

function makeRaw(overrides: Partial<FAJournal> = {}): FAJournal {
  return {
    id: 75,
    reference: 'JNL-2024-001',
    memo: 'Monthly reconciliation',
    tran_date: '2024-01-31',
    lines: [
      { id: 1, account: '1100', memo: 'Cash debit', amount: 1000 },
      { id: 2, account: '4000', memo: 'Sales credit', amount: -1000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('75')
    expect(result.reference).toBe('JNL-2024-001')
    expect(result.description).toBe('Monthly reconciliation')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps line items with debit/credit split', () => {
    const result = transformJournal(makeRaw())
    if (result.lineItems == null) throw new Error('expected lineItems to be defined')
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems[0].accountId).toBe('1100')
    expect(result.lineItems[0].debitAmount).toBe(1000)
    expect(result.lineItems[0].creditAmount).toBeUndefined()
    expect(result.lineItems[1].accountId).toBe('4000')
    expect(result.lineItems[1].creditAmount).toBe(1000)
    expect(result.lineItems[1].debitAmount).toBeUndefined()
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
