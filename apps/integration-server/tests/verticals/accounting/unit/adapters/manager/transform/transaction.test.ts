import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type ManagerPayment,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<ManagerPayment> = {}): ManagerPayment {
  return {
    key: 'pay-key-1',
    date: '2024-11-15',
    reference: 'PMT-001',
    paidFrom: 'bank-acct-uuid',
    description: 'Customer payment received',
    payee: 'Acme Ltd',
    amount: { value: 5000.0, currency: 'USD' },
    cleared: true,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps key to id', () => {
    expect(transformTransaction(makePayment()).id).toBe('pay-key-1')
  })

  it('maps paidFrom to accountId', () => {
    expect(transformTransaction(makePayment()).accountId).toBe('bank-acct-uuid')
  })

  it('hardcodes type to PAYMENT', () => {
    expect(transformTransaction(makePayment()).type).toBe('PAYMENT')
  })

  it('maps reference', () => {
    expect(transformTransaction(makePayment()).reference).toBe('PMT-001')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makePayment()).memo).toBe('Customer payment received')
  })

  it('converts amount to minor units', () => {
    // 5000.0 → 500000
    expect(transformTransaction(makePayment()).totalAmount).toBe(500000)
  })

  it('maps payee to contacts[0].name', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].name).toBe('Acme Ltd')
  })

  it('omits contacts when payee is absent', () => {
    const result = transformTransaction(makePayment({ payee: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('parses date as createdAt', () => {
    expect(transformTransaction(makePayment()).createdAt).toEqual(new Date('2024-11-15'))
  })

  it('passes schema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })
})
