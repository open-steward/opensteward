import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type BmanRegistrazione } from '../../../../../../../src/verticals/accounting/adapters/bman/transform/journal'

function makeJournal(overrides: Partial<BmanRegistrazione> = {}): BmanRegistrazione {
  return {
    id: 'jnl-1',
    numero: 'JNL-001',
    descrizione: 'Monthly closing',
    data: '2024-01-31',
    righe: [
      { conto: '7210', descrizione: 'Salary', dare: 50000, avere: 0 },
      { conto: '1930', descrizione: 'Bank', dare: 0, avere: 50000 },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id field', () => {
    expect(transformJournal(makeJournal()).id).toBe('jnl-1')
  })

  it('maps key fields', () => {
    const result = transformJournal(makeJournal())
    expect(result.description).toBe('Monthly closing')
    expect(result.reference).toBe('JNL-001')
  })

  it('maps date field as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps righe to lineItems', () => {
    const result = transformJournal(makeJournal())
    expect(result.lineItems).toHaveLength(2)
    const debit = result.lineItems![0]
    expect(debit.accountId).toBe('7210')
    expect(debit.debitAmount).toBe(50000)
    const credit = result.lineItems![1]
    expect(credit.accountId).toBe('1930')
    expect(credit.creditAmount).toBe(50000)
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
