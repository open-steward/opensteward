import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type NetSuiteJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/netsuite/transform/journal'

function makeJournal(overrides: Partial<NetSuiteJournalEntry> = {}): NetSuiteJournalEntry {
  return { id: 400, tranId: 'JE-001', memo: 'Adjustment', tranDate: '2024-04-01', lines: [{ id: 1, account: 1000, debit: 500 }], ...overrides }
}

describe('transformJournal (netsuite)', () => {
  it('maps id, reference, description', () => {
    const r = transformJournal(makeJournal())
    expect(r.id).toBe('400')
    expect(r.reference).toBe('JE-001')
    expect(r.description).toBe('Adjustment')
  })
  it('maps postedAt', () => { expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-04-01')) })
  it('maps lineItems', () => { expect(transformJournal(makeJournal()).lineItems).toHaveLength(1) })
  it('passes raw as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
