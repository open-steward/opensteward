import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type KlaraPayment,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'

function makePayment(overrides: Partial<KlaraPayment> = {}): KlaraPayment {
  return {
    id: 'pay-1',
    account_id: 'acct-bank',
    contact_id: 'cont-1',
    type: 'PAYMENT',
    reference: 'REF-100',
    currency: 'CHF',
    total_amount: 12000,
    payment_method: 'bank_transfer',
    payment_date: '2024-06-15T00:00:00.000Z',
    created_at: '2024-06-15T00:00:00.000Z',
    updated_at: '2024-06-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pay-1')
    expect(result.accountId).toBe('acct-bank')
    expect(result.type).toBe('PAYMENT')
    expect(result.reference).toBe('REF-100')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(12000)
    expect(result.paymentMethod).toBe('bank_transfer')
  })

  it('maps contact_id into contacts array', () => {
    const result = transformTransaction(makePayment())
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts![0].id).toBe('cont-1')
  })

  it('omits contacts when contact_id is absent', () => {
    const result = transformTransaction(makePayment({ contact_id: undefined }))
    expect(result.contacts).toBeUndefined()
  })

  it('uses payment_date as createdAt', () => {
    const result = transformTransaction(makePayment())
    expect(result.createdAt).toEqual(new Date('2024-06-15T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })
})
