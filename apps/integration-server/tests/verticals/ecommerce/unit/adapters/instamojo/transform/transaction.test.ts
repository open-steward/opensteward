import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawInstamojoPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawInstamojoPayment> = {}): RawInstamojoPayment {
  return {
    payment_id: 'pay_xyz001',
    status: 'Credit',
    amount: '499.00',
    currency: 'INR',
    instrument_type: 'UPI',
    payment_request: { id: 'pr_abc123' },
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (instamojo)', () => {
  it('maps payment_id as id', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pay_xyz001')
  })

  it('maps orderId from payment_request object id', () => {
    const result = transformTransaction(makePayment())
    expect(result.orderId).toBe('pr_abc123')
  })

  it('extracts orderId from payment_request URL string', () => {
    const result = transformTransaction(
      makePayment({
        payment_request: 'https://api.instamojo.com/v2/payment_requests/pr_abc123/',
      }),
    )
    expect(result.orderId).toBe('pr_abc123')
  })

  it('always sets kind to SALE', () => {
    const result = transformTransaction(makePayment())
    expect(result.kind).toBe('SALE')
  })

  it('maps Credit → SUCCESS status', () => {
    const result = transformTransaction(makePayment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all instamojo payment statuses to canonical', () => {
    const cases: [string, string][] = [
      ['Credit', 'SUCCESS'],
      ['credit', 'SUCCESS'],
      ['Failed', 'FAILURE'],
      ['failed', 'FAILURE'],
      ['Pending', 'PENDING'],
      ['pending', 'PENDING'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformTransaction(makePayment({ status: raw }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps amount in minor units (INR)', () => {
    const result = transformTransaction(makePayment())
    // 499.00 INR → 49900 minor units
    expect(result.amount).toEqual({ amount: 49900, currency: 'INR' })
  })

  it('maps gateway from instrument_type', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('UPI')
  })

  it('falls back to billing_instrument when instrument_type is null', () => {
    const result = transformTransaction(
      makePayment({ instrument_type: null, billing_instrument: 'NETBANKING' }),
    )
    expect(result.gateway).toBe('NETBANKING')
  })

  it('maps errorMessage from failure.message', () => {
    const result = transformTransaction(
      makePayment({
        status: 'Failed',
        failure: { reason: 'INSUFFICIENT_FUNDS', message: 'Card declined' },
      }),
    )
    expect(result.errorMessage).toBe('Card declined')
    expect(result.errorCode).toBe('INSUFFICIENT_FUNDS')
  })

  it('maps createdAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformTransaction(makePayment())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('defaults currency to INR when not provided', () => {
    const result = transformTransaction(makePayment({ currency: undefined }))
    expect(result.amount?.currency).toBe('INR')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
