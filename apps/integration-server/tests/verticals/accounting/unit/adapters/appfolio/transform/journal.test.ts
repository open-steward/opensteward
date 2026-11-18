import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AppFolioJournal } from '../../../../../../../src/verticals/accounting/adapters/appfolio/transform/journal'

function makeJournal(overrides: Partial<AppFolioJournal> = {}): AppFolioJournal {
  return {
    id: '501',
    date: '2024-03-15',
    description: 'Security deposit receipt',
    reference: 'REF-001',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (AppFolio)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeJournal())
    expect(result.id).toBe('501')
    expect(result.description).toBe('Security deposit receipt')
    expect(result.reference).toBe('REF-001')
  })

  it('parses ISO date as Date object', () => {
    const result = transformJournal(makeJournal())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
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
          id: 1,
          account_id: '1000',
          description: 'Cash',
          debit: 1000,
          credit: 0,
          property_id: 'prop_1',
        },
        {
          id: 2,
          account_id: '2000',
          description: 'Security Deposit Liability',
          debit: 0,
          credit: 1000,
          property_id: 'prop_1',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('1000')
    expect(result.lineItems![0].debitAmount).toBe(1000)
    expect(result.lineItems![1].creditAmount).toBe(1000)
  })

  it('returns empty lineItems when lines is empty', () => {
    const result = transformJournal(makeJournal({ lines: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('converts numeric id to string', () => {
    const result = transformJournal(makeJournal({ id: 5 }))
    expect(result.id).toBe('5')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
