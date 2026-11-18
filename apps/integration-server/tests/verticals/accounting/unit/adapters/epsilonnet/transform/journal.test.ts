import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type EpsilonNetJournal } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/journal'

function makeJournal(overrides: Partial<EpsilonNetJournal> = {}): EpsilonNetJournal {
  return {
    id: '3001',
    date: '2024-03-10',
    description: 'March journal entry',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('3001')
    expect(result.description).toBe('March journal entry')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps journal lines', () => {
    const raw = makeJournal({
      lines: [
        { id: 1, accountCode: '1000', description: 'Cash', debit: 1240, credit: 0 },
        { id: 2, accountCode: '4000', description: 'Revenue', debit: 0, credit: 1000 },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1000')
    expect(result.lineItems![0].debitAmount).toBe(1240)
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
