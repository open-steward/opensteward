import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawSezzleOrder,
} from '../../../../../../../src/verticals/payments/adapters/sezzle/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('sezzle transformCharge', () => {
  it('maps a captured order to status "succeeded" with correct amount/currency', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-001',
      intent: 'CAPTURE',
      checkout_status: 'complete',
      order_amount: { amount_in_cents: 4999, currency: 'USD' },
      authorization: {
        approved: true,
        captures: [{ uuid: 'cap-001', amount: { amount_in_cents: 4999, currency: 'USD' } }],
        refunds: [],
        releases: [],
      },
      customer: {
        uuid: 'cust-uuid-001',
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('order-uuid-001')
    expect(result.externalId).toBe('order-uuid-001')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.customerId).toBe('cust-uuid-001')
    expect(result.receiptEmail).toBe('jane@example.com')
    expect(result.gateway).toBe('sezzle')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a denied checkout to status "failed"', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-002',
      intent: 'AUTH',
      checkout_status: 'denied',
      order_amount: { amount_in_cents: 2000, currency: 'USD' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.amount).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a fully refunded order to status "refunded"', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-003',
      order_amount: { amount_in_cents: 3000, currency: 'USD' },
      authorization: {
        captures: [{ uuid: 'cap-001', amount: { amount_in_cents: 3000, currency: 'USD' } }],
        refunds: [{ uuid: 'ref-001', amount: { amount_in_cents: 3000, currency: 'USD' } }],
        releases: [],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a partially refunded order to status "partially_refunded"', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-004',
      order_amount: { amount_in_cents: 5000, currency: 'USD' },
      authorization: {
        captures: [{ uuid: 'cap-001', amount: { amount_in_cents: 5000, currency: 'USD' } }],
        refunds: [{ uuid: 'ref-001', amount: { amount_in_cents: 2000, currency: 'USD' } }],
        releases: [],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending order (no captures, authorized) to status "pending"', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-005',
      order_amount: { amount_in_cents: 1000, currency: 'USD' },
      authorization: {
        approved: true,
        captures: [],
        refunds: [],
        releases: [],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a released order to status "cancelled"', () => {
    const raw: RawSezzleOrder = {
      uuid: 'order-uuid-006',
      order_amount: { amount_in_cents: 1500, currency: 'USD' },
      authorization: {
        approved: true,
        captures: [],
        refunds: [],
        releases: [{ uuid: 'rel-001' }],
      },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
