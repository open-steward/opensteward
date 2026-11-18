import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type AutocountJournal,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/journal'

function makeRaw(overrides: Partial<AutocountJournal> = {}): AutocountJournal {
  return {
    DocNo: 'JV-001',
    DocDate: '2024-03-01',
    Description: 'Monthly accrual',
    Cancelled: false,
    JournalDetails: [],
    ...overrides,
  }
}

describe('transformJournal (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('JV-001')
    expect(result.description).toBe('Monthly accrual')
    expect(result.reference).toBe('JV-001')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps JournalDetails to lineItems', () => {
    const raw = makeRaw({
      JournalDetails: [
        {
          Seq: 1,
          AccNo: '100-000',
          Description: 'Cash account',
          DrAmt: 500,
          CrAmt: 0,
          CurrencyCode: 'MYR',
        },
        {
          Seq: 2,
          AccNo: '400-000',
          Description: 'Revenue',
          DrAmt: 0,
          CrAmt: 500,
          CurrencyCode: 'MYR',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].id).toBe('1')
    expect(result.lineItems![0].accountId).toBe('100-000')
    expect(result.lineItems![0].debitAmount).toBe(500)
    expect(result.lineItems![0].creditAmount).toBeUndefined()
    expect(result.lineItems![1].creditAmount).toBe(500)
    expect(result.lineItems![1].debitAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
