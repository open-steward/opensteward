import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type CmicJournal } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/journal'

function makeJournal(overrides: Partial<CmicJournal> = {}): CmicJournal {
  return {
    JournalId: 'JE-001',
    Description: 'Project cost allocation',
    PostedDate: '2024-03-31',
    ProjectCode: 'PRJ-001',
    Status: 'Posted',
    Lines: [],
    ...overrides,
  }
}

describe('transformJournal (CMiC)', () => {
  it('maps id from JournalId', () => {
    expect(transformJournal(makeJournal()).id).toBe('JE-001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Project cost allocation')
  })

  it('parses PostedDate as Date object', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('maps journal lines', () => {
    const raw = makeJournal({
      Lines: [
        {
          LineId: 'JL-1',
          AccountCode: '5100',
          Description: 'Labour costs',
          DebitAmount: 10000,
          CreditAmount: 0,
          CostCode: 'CC-LABOUR',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('JL-1')
    expect(result.lineItems![0].accountId).toBe('5100')
    expect(result.lineItems![0].debitAmount).toBe(10000)
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
