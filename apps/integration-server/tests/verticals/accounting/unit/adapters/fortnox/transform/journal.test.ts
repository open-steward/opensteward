import { describe, it, expect } from 'vitest'
import { JournalSchema } from '../../../../../../../src/verticals/accounting/schema/journal'
import {
  transformJournal,
  type FortnoxVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/journal'

function makeVoucher(overrides: Partial<FortnoxVoucher> = {}): FortnoxVoucher {
  return {
    VoucherNumber: 42,
    VoucherSeries: 'A',
    Description: 'Salary payment',
    TransactionDate: '2024-01-31',
    Comments: '',
    ReferenceNumber: '',
    VoucherRows: [
      {
        Account: 7210,
        Debit: 50000,
        Credit: 0,
        Description: 'Gross salary',
        CostCenter: 'SALES',
        Project: 'P01',
        TransactionInformation: '',
      },
      {
        Account: 1930,
        Debit: 0,
        Credit: 50000,
        Description: 'Bank payment',
        CostCenter: '',
        Project: '',
        TransactionInformation: '',
      },
    ],
    ...overrides,
  }
}

describe('transformJournal', () => {
  it('concatenates series and number as id', () => {
    expect(transformJournal(makeVoucher()).id).toBe('A42')
  })

  it('maps VoucherSeries to reference', () => {
    expect(transformJournal(makeVoucher()).reference).toBe('A')
  })

  it('maps Description', () => {
    expect(transformJournal(makeVoucher()).description).toBe('Salary payment')
  })

  it('maps TransactionDate to postedAt', () => {
    expect(transformJournal(makeVoucher()).postedAt).toEqual(new Date('2024-01-31'))
  })

  it('maps VoucherRows to lineItems', () => {
    const j = transformJournal(makeVoucher())
    expect(j.lineItems).toHaveLength(2)

    const debit = j.lineItems![0]
    expect(debit.accountId).toBe('7210')
    expect(debit.debitAmount).toBe(5000000)
    expect(debit.creditAmount).toBeUndefined()
    expect(debit.groupId).toBe('SALES')
    expect(debit.projectId).toBe('P01')

    const credit = j.lineItems![1]
    expect(credit.accountId).toBe('1930')
    expect(credit.creditAmount).toBe(5000000)
    expect(credit.debitAmount).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeVoucher()
    expect(transformJournal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformJournal(makeVoucher())
    expect(() => JournalSchema.parse(result)).not.toThrow()
  })
})
