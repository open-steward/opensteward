import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type AcumaticaJournal } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/journal'

function makeJournal(overrides: Partial<AcumaticaJournal> = {}): AcumaticaJournal {
  return {
    BatchNbr: 'JNL001',
    Description: 'Monthly accrual',
    DateEntered: '2024-03-31',
    Details: [],
    ...overrides,
  }
}

describe('transformJournal (Acumatica)', () => {
  it('maps id from BatchNbr', () => {
    expect(transformJournal(makeJournal()).id).toBe('JNL001')
  })

  it('maps description', () => {
    expect(transformJournal(makeJournal()).description).toBe('Monthly accrual')
  })

  it('parses DateEntered as Date', () => {
    expect(transformJournal(makeJournal()).postedAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeJournal()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('maps Details to lineItems', () => {
    const raw = makeJournal({
      Details: [
        {
          LineNbr: 1,
          AccountID: '1000',
          Description: 'Cash',
          DebitAmt: 500,
          CreditAmt: 0,
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].accountId).toBe('1000')
    expect(result.lineItems![0].debitAmount).toBe(500)
  })

  it('returns empty lineItems when Details is empty', () => {
    expect(transformJournal(makeJournal({ Details: [] })).lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeJournal())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
