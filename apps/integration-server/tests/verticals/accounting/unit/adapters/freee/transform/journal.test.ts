import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FreeeDeal } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/journal'

function makeRaw(overrides: Partial<FreeeDeal> = {}): FreeeDeal {
  return {
    id: 7001,
    issue_date: '2024-05-10',
    amount: 10000,
    type: 'income',
    status: 'settled',
    account_id: 1,
    partner_id: 42,
    details: [],
    ...overrides,
  }
}

describe('transformJournal (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('7001')
    expect(result.description).toBe('income')
  })

  it('parses issue_date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-05-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps deal details to journal lineItems', () => {
    const raw = makeRaw({
      details: [
        { id: 1, amount: 5000, account_item_id: 100, tax_code: 1 },
        { id: 2, amount: -5000, account_item_id: 200, tax_code: 1 },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('100')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].accountId).toBe('200')
    expect(result.lineItems![1].creditAmount).toBe(5000)
    expect(result.lineItems![1].debitAmount).toBeUndefined()
  })

  it('handles empty details array', () => {
    const result = transformJournal(makeRaw({ details: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
