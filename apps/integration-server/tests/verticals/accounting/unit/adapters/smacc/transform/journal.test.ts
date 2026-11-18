import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type SmaccJournal } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/journal'

function makeRaw(overrides: Partial<SmaccJournal> = {}): SmaccJournal {
  return {
    id: 'j-1',
    reference: 'JNL-001',
    date: '2024-07-15',
    currency: 'EUR',
    description: 'Monthly accrual',
    lines: [],
    ...overrides,
  }
}

describe('smacc transformJournal', () => {
  it('maps id to id', () => {
    expect(transformJournal(makeRaw()).id).toBe('j-1')
  })

  it('maps reference to reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('JNL-001')
  })

  it('maps description to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Monthly accrual')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-07-15'))
  })

  it('maps lines to lineItems', () => {
    const raw = makeRaw({
      lines: [{ id: 'l-1', account_id: 'acc-5', description: 'Rent', debit: 500, credit: 0 }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(500)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
