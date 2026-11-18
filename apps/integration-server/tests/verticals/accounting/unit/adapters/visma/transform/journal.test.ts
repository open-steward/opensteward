import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import { transformJournal, type VismaVoucher } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/journal'

function makeVoucher(overrides: Partial<VismaVoucher> = {}): VismaVoucher {
  return {
    Id: 'voucher-uuid-1234',
    Description: 'Monthly salary',
    VoucherDate: '2024-01-31',
    CreatedUtc: '2024-01-31T12:00:00Z',
    ModifiedUtc: '2024-01-31T12:00:00Z',
    Rows: [
      {
        AccountNumber: 7210,
        DebitAmount: 35000,
        CreditAmount: 0,
        Description: 'Salary expense',
        CostCenterItemId1: '',
        ProjectId: '',
      },
      {
        AccountNumber: 1930,
        DebitAmount: 0,
        CreditAmount: 35000,
        Description: 'Bank payment',
        CostCenterItemId1: '',
        ProjectId: '',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('maps core fields', () => {
    const result = transformJournal(makeVoucher())
    expect(result.id).toBe('voucher-uuid-1234')
    expect(result.description).toBe('Monthly salary')
  })

  it('parses voucher date', () => {
    const result = transformJournal(makeVoucher())
    expect(result.postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps voucher rows to journal lineItems', () => {
    const result = transformJournal(makeVoucher())
    expect(result.lineItems).toHaveLength(2)

    const debitLine = result.lineItems![0]
    expect(debitLine.accountId).toBe('7210')
    expect(debitLine.debitAmount).toBe(35000)
    expect(debitLine.creditAmount).toBeUndefined()
    expect(debitLine.description).toBe('Salary expense')

    const creditLine = result.lineItems![1]
    expect(creditLine.accountId).toBe('1930')
    expect(creditLine.debitAmount).toBeUndefined()
    expect(creditLine.creditAmount).toBe(35000)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeVoucher()
    const result = transformJournal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeVoucher())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
