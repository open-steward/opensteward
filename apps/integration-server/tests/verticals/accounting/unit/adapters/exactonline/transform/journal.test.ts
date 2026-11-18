import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ExactJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/journal'

function makeJournal(overrides: Partial<ExactJournalEntry> = {}): ExactJournalEntry {
  return {
    EntryID: 'j-1', EntryNumber: 42, Description: 'Journal entry', EntryDate: '2024-04-01',
    Lines: [{ ID: 'l-1', GLAccount: 'acct-1', Description: 'Debit', AmountDCDebit: 500, AmountDC: 500 }],
    ...overrides,
  }
}

describe('transformJournal (exactonline)', () => {
  it('maps id and reference from EntryNumber', () => {
    const r = transformJournal(makeJournal())
    expect(r.id).toBe('j-1')
    expect(r.reference).toBe('42')
  })
  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Journal entry')
  })
  it('maps postedAt', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-04-01'))
  })
  it('maps lineItems', () => {
    const r = transformJournal(makeJournal())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0]?.debitAmount).toBe(500)
  })
  it('passes raw as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
