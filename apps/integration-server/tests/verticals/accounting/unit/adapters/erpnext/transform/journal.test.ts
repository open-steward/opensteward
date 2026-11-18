import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type ErpNextJournalEntry } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/journal'

function makeRaw(overrides: Partial<ErpNextJournalEntry> = {}): ErpNextJournalEntry {
  return {
    name: 'JV-2024-00001',
    posting_date: '2024-01-31',
    user_remark: 'Month-end accruals',
    accounts: [
      { name: 'row-1', account: '1100 - Cash', user_remark: 'Cash debit', debit_in_account_currency: 1000, credit_in_account_currency: 0 },
      { name: 'row-2', account: '4000 - Sales', user_remark: 'Sales credit', debit_in_account_currency: 0, credit_in_account_currency: 1000 },
    ],
    ...overrides,
  }
}

describe('transformJournal (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformJournal(makeRaw())
    expect(result.id).toBe('JV-2024-00001')
    expect(result.reference).toBe('JV-2024-00001')
    expect(result.description).toBe('Month-end accruals')
  })

  it('parses date as Date object', () => {
    const result = transformJournal(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps accounts as line items', () => {
    const result = transformJournal(makeRaw())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].accountId).toBe('1100 - Cash')
    expect(result.lineItems?.[0].debitAmount).toBe(1000)
    expect(result.lineItems?.[1].accountId).toBe('4000 - Sales')
    expect(result.lineItems?.[1].creditAmount).toBe(1000)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeRaw())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
