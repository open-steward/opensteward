import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AlegraJournal } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/journal'

function makeJournal(overrides: Partial<AlegraJournal> = {}): AlegraJournal {
  return {
    id: 11,
    description: 'Monthly adjustment',
    reference: 'REF-001',
    date: '2024-01-31',
    entries: [
      { accountId: 4001, description: 'Revenue', debit: 5000, credit: 0, costCenterId: 0 },
      { accountId: 1001, description: 'Bank', debit: 0, credit: 5000, costCenterId: 0 },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps id to string', () => {
    expect(transformJournal(makeJournal()).id).toBe('11')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly adjustment')
  })

  it('maps reference', () => {
    expect(transformJournal(makeJournal()).reference).toBe('REF-001')
  })

  it('maps date to postedAt as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps entries to lineItems', () => {
    const j = transformJournal(makeJournal())
    expect(j.lineItems).toHaveLength(2)
    expect(j.lineItems![0].accountId).toBe('4001')
    expect(j.lineItems![0].debitAmount).toBe(5000)
    expect(j.lineItems![0].creditAmount).toBeUndefined()
    expect(j.lineItems![1].accountId).toBe('1001')
    expect(j.lineItems![1].creditAmount).toBe(5000)
    expect(j.lineItems![1].debitAmount).toBeUndefined()
  })

  it('maps costCenterId to groupId', () => {
    const raw = makeJournal({
      entries: [{ accountId: 4001, description: 'Rev', debit: 5000, credit: 0, costCenterId: 10 }],
    })
    const j = transformJournal(raw)
    expect(j.lineItems![0].groupId).toBe('10')
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
