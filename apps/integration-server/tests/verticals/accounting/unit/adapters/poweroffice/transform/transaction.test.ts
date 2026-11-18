import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type PowerOfficeTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/transaction'

function makeTransaction(overrides: Partial<PowerOfficeTransaction> = {}): PowerOfficeTransaction {
  return {
    id: 600,
    transactionDate: '2024-10-15',
    description: 'Customer payment',
    amount: 1500,
    currencyCode: 'NOK',
    bankAccountCode: 'BANK-001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('600')
  })

  it('maps bankAccountCode to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('BANK-001')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Customer payment')
  })

  it('maps currencyCode to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1500)
  })

  it('parses transactionDate as Date object for createdAt', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-10-15'))
  })

  it('sets accountId to undefined when bankAccountCode is empty', () => {
    expect(transformTransaction(makeTransaction({ bankAccountCode: '' })).accountId).toBeUndefined()
  })

  it('sets memo to undefined when description is empty', () => {
    expect(transformTransaction(makeTransaction({ description: '' })).memo).toBeUndefined()
  })

  it('sets createdAt to undefined when transactionDate is empty', () => {
    expect(transformTransaction(makeTransaction({ transactionDate: '' })).createdAt).toBeUndefined()
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
