import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AccounteerJournal } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/journal'

function makeRaw(overrides: Partial<AccounteerJournal> = {}): AccounteerJournal {
  return { id: '1', ...overrides }
}

describe('accounteer transformJournal', () => {
  it('maps id', () => {
    expect(transformJournal(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })
  it('maps date to postedAt as Date', () => {
    const result = transformJournal(makeRaw({ date: '2024-05-10' }))
    expect(result.postedAt).toEqual(new Date('2024-05-10'))
  })
  it('maps lines to lineItems', () => {
    const raw = makeRaw({
      lines: [{ id: 'l1', account_id: 'acc-1', debit: 100, credit: 0 }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('acc-1')
    expect(result.lineItems![0].debitAmount).toBe(100)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
