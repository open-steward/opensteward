import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type UhasibuJournal } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/journal'

function makeRaw(overrides: Partial<UhasibuJournal> = {}): UhasibuJournal {
  return {
    id: 'uj-1',
    reference: 'JNL-U01',
    date: '2024-07-20',
    currency: 'KES',
    description: 'Year-end accrual',
    lines: [],
    ...overrides,
  }
}

describe('uhasibu transformJournal', () => {
  it('maps id to id', () => {
    expect(transformJournal(makeRaw()).id).toBe('uj-1')
  })

  it('maps reference to reference', () => {
    expect(transformJournal(makeRaw()).reference).toBe('JNL-U01')
  })

  it('maps description to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('Year-end accrual')
  })

  it('maps date to postedAt as Date', () => {
    expect(transformJournal(makeRaw()).postedAt).toEqual(new Date('2024-07-20'))
  })

  it('maps lines to lineItems', () => {
    const raw = makeRaw({
      lines: [{ id: 'l-1', account_id: 'acc-7', description: 'Wages', debit: 3000, credit: 0 }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].debitAmount).toBe(3000)
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
