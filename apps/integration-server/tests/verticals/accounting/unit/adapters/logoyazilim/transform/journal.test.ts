import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type LogoJournal } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/journal'

function makeJournal(overrides: Partial<LogoJournal> = {}): LogoJournal {
  return {
    id: '800',
    Date: '2024-01-31',
    Description: 'End of month accrual',
    Lines: [
      { id: 'l1', AccountCode: '1000', Debit: 10000, Credit: 0, Description: 'Receivable' },
      { id: 'l2', AccountCode: '4000', Debit: 0, Credit: 10000, Description: 'Revenue' },
    ],
    ...overrides,
  }
}

describe('transformJournal (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformJournal(makeJournal()).id).toBe('800')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('End of month accrual')
  })

  it('parses date as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps journal lines to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)
    expect(j.lineItems?.[0].id).toBe('l1')
    expect(j.lineItems?.[0].accountId).toBe('1000')
    expect(j.lineItems?.[0].debitAmount).toBe(10000)
    expect(j.lineItems?.[0].creditAmount).toBe(0)
    expect(j.lineItems?.[1].creditAmount).toBe(10000)
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('handles missing lines gracefully', () => {
    const raw: LogoJournal = { id: '999', Description: 'test' }
    const j = transformJournal(raw)
    expect(j.lineItems).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
