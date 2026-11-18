import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type IntacctTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/transaction'

function makeTransaction(overrides: Partial<IntacctTransaction> = {}): IntacctTransaction {
  return {
    RECORDNO: 'txn-1',
    CUSTOMERNAME: 'Acme Corp',
    CUSTOMERID: 'cust-1',
    AMOUNT: '750.00',
    CURRENCY: 'USD',
    WHENCREATED: '2024-03-01',
    DESCRIPTION: 'Payment received',
    FINANCIALENTITY: 'bank-1',
    STATE: 'Posted',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps RECORDNO to id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-1')
  })

  it('maps DESCRIPTION to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Payment received')
  })

  it('maps CURRENCY correctly', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('parses AMOUNT as totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(750)
  })

  it('maps CUSTOMERID to contacts[0].id', () => {
    expect(transformTransaction(makeTransaction()).contacts?.[0].id).toBe('cust-1')
  })

  it('maps CUSTOMERNAME to contacts[0].name', () => {
    expect(transformTransaction(makeTransaction()).contacts?.[0].name).toBe('Acme Corp')
  })

  it('parses WHENCREATED as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-01'))
  })

  it('sets createdAt to undefined when WHENCREATED is empty', () => {
    expect(transformTransaction(makeTransaction({ WHENCREATED: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
