import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type GustoJournal } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/journal'

function makeJournal(overrides: Partial<GustoJournal> = {}): GustoJournal {
  return {
    id: 'je_001',
    date: '2024-03-15',
    description: 'Payroll journal entry',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (Gusto)', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeJournal({ id: 'je_001' })).id).toBe('je_001')
  })

  it('maps numeric id to string', () => {
    expect(transformJournal(makeJournal({ id: 99 })).id).toBe('99')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal({ description: 'Monthly payroll' })).description).toBe('Monthly payroll')
  })

  it('parses date as Date object', () => {
    expect(transformJournal(makeJournal({ date: '2024-03-15' })).postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps journal lines to lineItems', () => {
    const raw = makeJournal({
      lines: [
        {
          id: 'jl_1',
          account_id: 'acct_100',
          description: 'Wages',
          debit_amount: 5000,
          credit_amount: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('jl_1')
    expect(result.lineItems![0].accountId).toBe('acct_100')
    expect(result.lineItems![0].description).toBe('Wages')
    expect(result.lineItems![0].debitAmount).toBe(5000)
  })

  it('returns empty lineItems for empty lines', () => {
    expect(transformJournal(makeJournal({ lines: [] })).lineItems).toEqual([])
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal({ id: 'je_001' }))
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
