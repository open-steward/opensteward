import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FoundationJournal } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/journal'

function makeJournal(overrides: Partial<FoundationJournal> = {}): FoundationJournal {
  return {
    JournalId: 'JE-001',
    JournalDate: '2024-03-15',
    Description: 'Monthly accrual',
    JobNumber: 'JOB-100',
    Lines: [],
    ...overrides,
  }
}

describe('transformJournal (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('JE-001')
    expect(result.description).toBe('Monthly accrual')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      Lines: [
        {
          LineId: 1,
          AccountNumber: '5000',
          Description: 'Debit entry',
          DebitAmount: 1000,
          CreditAmount: 0,
        },
        {
          LineId: 2,
          AccountNumber: '2000',
          Description: 'Credit entry',
          DebitAmount: 0,
          CreditAmount: 1000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
    expect(result.lineItems![0].accountId).toBe('5000')
  })

  it('returns empty lineItems when Lines is absent', () => {
    const raw = makeJournal({ Lines: [] })
    expect(transformJournal(raw).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
