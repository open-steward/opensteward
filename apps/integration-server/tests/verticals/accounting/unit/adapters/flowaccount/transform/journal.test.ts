import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type FlowAccountJournal } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/journal'

function makeJournal(overrides: Partial<FlowAccountJournal> = {}): FlowAccountJournal {
  return {
    id: 700,
    date: '2024-01-31',
    description: 'Closing journal entry',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('700')
    expect(result.description).toBe('Closing journal entry')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        {
          id: 'L-1',
          accountCode: '1001',
          description: 'Cash debit',
          debit: 5000,
          credit: 0,
        },
        {
          id: 'L-2',
          accountCode: '4001',
          description: 'Revenue credit',
          debit: 0,
          credit: 5000,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('L-1')
    expect(result.lineItems![0].accountId).toBe('1001')
    expect(result.lineItems![0].debitAmount).toBe(5000)
    expect(result.lineItems![1].creditAmount).toBe(5000)
  })

  it('handles empty lines', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
