import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawInstamojoPaymentRequest,
} from '../../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makePaymentRequest(
  overrides: Partial<RawInstamojoPaymentRequest> = {},
): RawInstamojoPaymentRequest {
  return {
    id: 'pr_abc123',
    email: 'rahul@example.com',
    phone: '+919876543210',
    buyer_name: 'Rahul Sharma',
    amount: '499.00',
    purpose: 'Order #1042',
    status: 'Completed',
    currency: 'INR',
    payments: [{ payment_id: 'pay_xyz001', status: 'Credit' }],
    created_at: '2024-03-01T00:00:00Z',
    modified_at: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (instamojo)', () => {
  it('maps id and orderNumber both to the payment request id', () => {
    const result = transformOrder(makePaymentRequest())
    expect(result.id).toBe('pr_abc123')
    expect(result.orderNumber).toBe('pr_abc123')
  })

  it('maps email and phone', () => {
    const result = transformOrder(makePaymentRequest())
    expect(result.email).toBe('rahul@example.com')
    expect(result.phone).toBe('+919876543210')
  })

  it('maps name and note from purpose', () => {
    const result = transformOrder(makePaymentRequest())
    expect(result.name).toBe('Order #1042')
    expect(result.note).toBe('Order #1042')
  })

  it('maps totalPrice in minor units (INR)', () => {
    const result = transformOrder(makePaymentRequest())
    // 499.00 INR → 49900 minor units
    expect(result.totalPrice).toEqual({ amount: 49900, currency: 'INR' })
  })

  it('maps Completed → PAID financial status', () => {
    const result = transformOrder(makePaymentRequest())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps all instamojo statuses to canonical', () => {
    const cases: [string, string][] = [
      ['Pending', 'PENDING'],
      ['pending', 'PENDING'],
      ['Sent', 'PENDING'],
      ['sent', 'PENDING'],
      ['Failed', 'PENDING'],
      ['failed', 'PENDING'],
      ['Completed', 'PAID'],
      ['completed', 'PAID'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformOrder(makePaymentRequest({ status: raw }))
      expect(result.financialStatus).toBe(expected)
    }
  })

  it('maps transactionIds from payments array', () => {
    const result = transformOrder(makePaymentRequest())
    expect(result.transactionIds).toEqual(['pay_xyz001'])
  })

  it('omits transactionIds when payments is empty', () => {
    const result = transformOrder(makePaymentRequest({ payments: [] }))
    expect(result.transactionIds).toBeUndefined()
  })

  it('maps createdAt and updatedAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformOrder(makePaymentRequest())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T01:00:00.000Z')
  })

  it('defaults currency to INR when not provided', () => {
    const result = transformOrder(makePaymentRequest({ currency: undefined }))
    expect(result.currency).toBe('INR')
  })

  it('returns undefined financialStatus for unknown status', () => {
    const result = transformOrder(makePaymentRequest({ status: 'UNKNOWN' }))
    expect(result.financialStatus).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makePaymentRequest()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makePaymentRequest())
    const body = untransformOrder(canonical)
    expect(body['email']).toBe('rahul@example.com')
    expect(body['purpose']).toBe('Order #1042')
    // 49900 minor → 499.00 major INR
    expect(body['amount']).toBe('499.00')
  })
})
