import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type Unit4Journal } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/journal'

function makeJournal(overrides: Partial<Unit4Journal> = {}): Unit4Journal {
  return {
    journalId: 'je_001',
    postingDate: '2024-03-15',
    description: 'Month-end accruals',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (Unit4)', () => {
  it('maps journalId to string id', () => {
    expect(transformJournal(makeJournal({ journalId: 'je_001' })).id).toBe('je_001')
  })

  it('maps numeric journalId to string', () => {
    expect(transformJournal(makeJournal({ journalId: 55 })).id).toBe('55')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal({ description: 'Payroll entry' })).description).toBe('Payroll entry')
  })

  it('parses postingDate as Date', () => {
    expect(transformJournal(makeJournal({ postingDate: '2024-03-15' })).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        {
          lineId: 'jl_1',
          accountCode: '6100',
          description: 'Wages expense',
          debitAmount: 10000,
          creditAmount: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('jl_1')
    expect(li.accountId).toBe('6100')
    expect(li.description).toBe('Wages expense')
    expect(li.debitAmount).toBe(10000)
  })

  it('returns empty lineItems for empty lines', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toEqual([])
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal({ journalId: 'je_001' }))
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
