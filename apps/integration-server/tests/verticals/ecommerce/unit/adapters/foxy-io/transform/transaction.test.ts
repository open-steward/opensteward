import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawFoxyPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/foxy-io/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawFoxyPayment> = {}): RawFoxyPayment {
  return {
    id: 600,
    transaction_id: 1001,
    gateway_type: 'stripe',
    amount: '49.99',
    currency_code: 'USD',
    status: 'approved',
    date_created: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Foxy.io)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('600')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.gateway).toBe('stripe')
  })

  it('hardcodes kind to SALE (Foxy payments are always captures)', () => {
    const result = transformTransaction(makePayment())
    expect(result.kind).toBe('SALE')
  })

  it('converts amount from major units to minor units', () => {
    const result = transformTransaction(makePayment())
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps Foxy status strings to canonical TransactionStatus', () => {
    expect(transformTransaction(makePayment({ status: 'approved' })).status).toBe('SUCCESS')
    expect(transformTransaction(makePayment({ status: 'declined' })).status).toBe('FAILURE')
    expect(transformTransaction(makePayment({ status: 'pending' })).status).toBe('PENDING')
    expect(transformTransaction(makePayment({ status: 'error' })).status).toBe('ERROR')
  })

  it('returns undefined status for unknown status values', () => {
    const result = transformTransaction(makePayment({ status: 'unknown_value' }))
    expect(result.status).toBeUndefined()
  })

  it('returns undefined amount when raw.amount is null', () => {
    const result = transformTransaction(makePayment({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('returns undefined orderId when transaction_id is null', () => {
    const result = transformTransaction(makePayment({ transaction_id: null }))
    expect(result.orderId).toBeUndefined()
  })

  it('defaults currency to USD when currency_code is absent', () => {
    const result = transformTransaction(makePayment({ currency_code: null }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
