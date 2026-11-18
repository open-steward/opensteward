import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type EcountJournal,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/journal'

function makeRaw(overrides: Partial<EcountJournal> = {}): EcountJournal {
  return {
    SLIP_NO: 'VC-2024-001',
    SLIP_DATE: '2024-01-15',
    REMARK: 'Monthly closing entry',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformJournal (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('VC-2024-001')
    expect(result.description).toBe('Monthly closing entry')
    expect(result.reference).toBe('VC-2024-001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-15'))
  })

  it('maps ITEM_LIST to lineItems', () => {
    const raw = makeRaw({
      ITEM_LIST: [
        {
          SEQ: 1,
          ACCOUNT_CODE: '1001',
          ACCOUNT_NAME: 'Cash',
          DR_AMT: 100000,
          CR_AMT: 0,
          REMARK: 'Debit cash',
        },
        {
          SEQ: 2,
          ACCOUNT_CODE: '4001',
          ACCOUNT_NAME: 'Sales Revenue',
          DR_AMT: 0,
          CR_AMT: 100000,
          REMARK: 'Credit revenue',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('1001')
    expect(result.lineItems![0].debitAmount).toBe(100000)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].accountId).toBe('4001')
    expect(result.lineItems![1].creditAmount).toBe(100000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing date gracefully', () => {
    const result = transformJournal(makeRaw({ SLIP_DATE: undefined }))
    expect(result.postedAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
