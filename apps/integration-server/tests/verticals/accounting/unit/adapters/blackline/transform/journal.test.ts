import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type BlacklineJournal } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/journal'

function makeJournal(overrides: Partial<BlacklineJournal> = {}): BlacklineJournal {
  return {
    journalId: 'je-001',
    description: 'Month-end close entry',
    postedDate: '2024-03-31',
    status: 'Posted',
    createdBy: 'user-1',
    createdAt: '2024-03-31T23:00:00Z',
    modifiedBy: 'user-1',
    modifiedAt: '2024-03-31T23:00:00Z',
    lines: [],
    ...overrides,
  }
}

describe('transformJournal (BlackLine)', () => {
  it('maps id from journalId', () => {
    expect(transformJournal(makeJournal()).id).toBe('je-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Month-end close entry')
  })

  it('parses postedDate as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('maps journal lines', () => {
    const raw = makeJournal({
      lines: [
        {
          lineId: 'jl-1',
          accountId: '1000',
          description: 'Cash DR',
          debitAmount: 500,
          creditAmount: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('jl-1')
    expect(li.accountId).toBe('1000')
    expect(li.debitAmount).toBe(500)
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
