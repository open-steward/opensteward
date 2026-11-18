import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type FireflyTransactionResource,
} from '../../../../../../../src/verticals/accounting/adapters/firefly-iii/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makeTransaction(
  overrides: Partial<FireflyTransactionResource['attributes']> = {},
): FireflyTransactionResource {
  return {
    type: 'transactions',
    id: '99',
    attributes: {
      created_at: '2024-04-01T10:00:00.000Z',
      updated_at: '2024-04-01T10:05:00.000Z',
      user: 'user1',
      group_title: null,
      transactions: [
        {
          transaction_journal_id: 'tj-99',
          type: 'withdrawal',
          date: '2024-04-01T00:00:00.000Z',
          amount: '200.00',
          description: 'Office supplies',
          currency_code: 'GBP',
          source_id: 'acc-1',
          source_name: 'Business Checking',
          source_type: 'asset',
          destination_id: 'acc-2',
          destination_name: 'Office Expenses',
          destination_type: 'expense',
          category_name: 'Supplies',
          budget_name: null,
          notes: 'Q2 stationery',
          tags: null,
          reconciled: false,
        },
      ],
      ...overrides,
    },
  }
}

describe('transformTransaction (firefly-iii)', () => {
  it('maps id from resource id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('99')
  })

  it('maps source_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-1')
  })

  it('maps destination_id to splitAccountId', () => {
    expect(transformTransaction(makeTransaction()).splitAccountId).toBe('acc-2')
  })

  it('maps first split type to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('withdrawal')
  })

  it('converts decimal amount to minor units for totalAmount', () => {
    // '200.00' → 20000
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(20000)
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('GBP')
  })

  it('builds contacts array from source and destination ids', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.contacts).toHaveLength(2)
    expect(result.contacts![0]!.id).toBe('acc-1')
    expect(result.contacts![1]!.id).toBe('acc-2')
  })

  it('deduplicates contacts when source_id equals destination_id', () => {
    const raw = makeTransaction()
    raw.attributes.transactions[0]!.destination_id = 'acc-1'
    const result = transformTransaction(raw)
    expect(result.contacts).toHaveLength(1)
  })

  it('maps group_title to reference', () => {
    const result = transformTransaction(makeTransaction({ group_title: 'Payroll run' }))
    expect(result.reference).toBe('Payroll run')
  })

  it('maps notes to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Q2 stationery')
  })

  it('returns minimal object with just id and timestamps when splits is empty', () => {
    const result = transformTransaction(makeTransaction({ transactions: [] }))
    expect(result.id).toBe('99')
    expect(result.accountId).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
  })

  it('does not populate lineItems for a single-split transaction', () => {
    expect(transformTransaction(makeTransaction()).lineItems).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-04-01T10:00:00.000Z'))
    expect(result.updatedAt).toEqual(new Date('2024-04-01T10:05:00.000Z'))
  })

  it('produces a schema-valid Transaction', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeTransaction()))).not.toThrow()
  })
})
