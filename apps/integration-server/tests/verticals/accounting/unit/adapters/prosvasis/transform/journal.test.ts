import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ProsvasisJournal } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/journal'

function makeJournal(overrides: Partial<ProsvasisJournal> = {}): ProsvasisJournal {
  return {
    id: '3001',
    Date: '2024-03-10',
    Description: 'Monthly entry',
    Lines: [],
    ...overrides,
  }
}

describe('transformJournal (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('3001')
    expect(result.description).toBe('Monthly entry')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps journal lines', () => {
    const raw = makeJournal({
      Lines: [
        { Id: 1, AccountCode: '1000', Description: 'Cash', Debit: 1240, Credit: 0 },
        { Id: 2, AccountCode: '4000', Description: 'Revenue', Debit: 0, Credit: 1000 },
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
