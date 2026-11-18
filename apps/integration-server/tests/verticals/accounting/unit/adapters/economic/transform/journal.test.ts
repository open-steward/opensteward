import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type EconomicJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/journal'

function makeRaw(overrides: Partial<EconomicJournalEntry> = {}): EconomicJournalEntry {
  return {
    journalNumber: 1,
    name: 'General Journal',
    entries: [],
    ...overrides,
  }
}

describe('economic transformJournal', () => {
  it('maps journalNumber to id', () => {
    expect(transformJournal(makeRaw()).id).toBe('1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformJournal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })
  it('maps name to description', () => {
    expect(transformJournal(makeRaw()).description).toBe('General Journal')
  })
  it('maps positive amount to debitAmount', () => {
    const raw = makeRaw({
      entries: [{
        entryNumber: 1,
        account: { accountNumber: 1000, name: 'Cash' },
        amount: 300,
        amountInBaseCurrency: 300,
        text: 'Test',
        date: '2024-01-01',
      }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].debitAmount).toBe(300)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
  })
  it('maps negative amount to creditAmount', () => {
    const raw = makeRaw({
      entries: [{
        entryNumber: 2,
        account: null,
        amount: -200,
        amountInBaseCurrency: -200,
        text: '',
        date: '2024-01-01',
      }],
    })
    const result = transformJournal(raw)
    expect(result.lineItems![0].creditAmount).toBe(200)
    expect(result.lineItems![0].debitAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
