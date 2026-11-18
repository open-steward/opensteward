import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AccurateJournal } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/journal'

function makeJournal(overrides: Partial<AccurateJournal> = {}): AccurateJournal {
  return {
    id: 6001,
    date: '2024-06-15',
    description: 'Penyesuaian jurnal akhir bulan',
    lines: [
      { id: 1, accountNo: '1-1001', description: 'Cash debit', debitAmount: 2000000, creditAmount: 0 },
      { id: 2, accountNo: '3-1001', description: 'Revenue credit', debitAmount: 0, creditAmount: 2000000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('6001')
    expect(result.description).toBe('Penyesuaian jurnal akhir bulan')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-06-15'))
  })

  it('maps journal lines correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1-1001')
    expect(result.lineItems![0].description).toBe('Cash debit')
    expect(result.lineItems![0].debitAmount).toBe(2000000)
    expect(result.lineItems![0].creditAmount).toBe(0)
    expect(result.lineItems![1].accountId).toBe('3-1001')
    expect(result.lineItems![1].creditAmount).toBe(2000000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeJournal()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null description', () => {
    const result = transformJournal(makeJournal({ description: null }))
    expect(result.description).toBeUndefined()
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
