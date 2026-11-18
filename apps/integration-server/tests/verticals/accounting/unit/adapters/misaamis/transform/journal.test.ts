import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type MisaAmisJournalEntry,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/journal'

function makeRaw(overrides: Partial<MisaAmisJournalEntry> = {}): MisaAmisJournalEntry {
  return {
    id: 'je-001',
    reference_number: 'JE-2024-001',
    entry_date: '2024-03-15',
    description: 'Ghi chép nghiệp vụ',
    journal_entry_details: [],
    ...overrides,
  }
}

describe('transformJournal (misaamis)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('je-001')
    expect(result.reference).toBe('JE-2024-001')
    expect(result.description).toBe('Ghi chép nghiệp vụ')
  })

  it('parses entry_date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps journal_entry_details to lineItems', () => {
    const raw = makeRaw({
      journal_entry_details: [
        {
          id: 'detail-001',
          account_id: 'acc-001',
          account_code: '1111',
          account_name: 'Tiền mặt',
          description: 'Nộp tiền vào quỹ',
          debit_amount: 1000000,
          credit_amount: 0,
          currency_code: 'VND',
        },
        {
          id: 'detail-002',
          account_id: 'acc-002',
          account_code: '5111',
          account_name: 'Doanh thu',
          description: 'Thu tiền bán hàng',
          debit_amount: 0,
          credit_amount: 1000000,
          currency_code: 'VND',
        },
      ],
    })
    const result = transformJournal(raw)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0].accountId).toBe('acc-001')
    expect(result.lineItems![0].debitAmount).toBe(1000000)
    expect(result.lineItems![1].accountId).toBe('acc-002')
    expect(result.lineItems![1].creditAmount).toBe(1000000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles empty journal_entry_details', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems).toEqual([])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
