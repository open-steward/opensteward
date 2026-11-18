import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawModernTreasuryPaymentOrder,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

/**
 * Fixture: the documented `payment_order` object (fields of the `payment_order`
 * schema in github.com/Modern-Treasury/modern-treasury-openapi,
 * openapi/mt_openapi_spec_v1.yaml), as returned by GET /api/payment_orders.
 */
const ORDER: RawModernTreasuryPaymentOrder = {
  id: 'b6ea5c2f-8b3e-4f36-9d0a-6a0f0a4f2b11',
  object: 'payment_order',
  live_mode: true,
  type: 'ach',
  amount: 1000,
  direction: 'debit',
  priority: 'normal',
  originating_account_id: '0f8e3719-3dfd-4613-9bbf-c0333781b59f',
  receiving_account_id: '5acec9ef-987b-4260-b1b8-ec8a6e8e0e5f',
  currency: 'USD',
  effective_date: '2026-03-02',
  description: 'Invoice 1042 collection',
  statement_descriptor: 'ACME 1042',
  metadata: { invoice: '1042' },
  status: 'completed',
  counterparty_id: '37ba4454-dd33-4aa0-8906-0e2e4103e45c',
  transaction_ids: [],
  created_at: '2026-03-01T12:00:00Z',
  updated_at: '2026-03-02T08:30:00Z',
}

describe('modern-treasury transformCharge', () => {
  it('refuses a payment order without an id', () => {
    expect(() => transformCharge({ ...ORDER, id: '' })).toThrow(/no id/)
    expect(() =>
      transformCharge({ ...ORDER, id: undefined } as unknown as RawModernTreasuryPaymentOrder),
    ).toThrow(/no id/)
  })

  it('maps a documented debit payment order', () => {
    const result = ChargeSchema.parse(transformCharge(ORDER))
    expect(result).toMatchObject({
      id: ORDER.id,
      externalId: ORDER.id,
      amount: 1000,
      currency: 'USD',
      status: 'succeeded',
      customerId: '37ba4454-dd33-4aa0-8906-0e2e4103e45c',
      description: 'Invoice 1042 collection',
      gateway: 'modern-treasury',
      metadata: { invoice: '1042' },
      createdAt: '2026-03-01T12:00:00Z',
      updatedAt: '2026-03-02T08:30:00Z',
    })
  })

  it.each([
    ['approved', 'pending'],
    ['needs_approval', 'pending'],
    ['pending', 'pending'],
    ['processing', 'pending'],
    ['held', 'pending'],
    ['sent', 'pending'],
    ['completed', 'succeeded'],
    ['failed', 'failed'],
    ['denied', 'failed'],
    ['returned', 'failed'],
    ['reversed', 'refunded'],
    ['cancelled', 'cancelled'],
    ['stopped', 'cancelled'],
    ['something_new', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...ORDER, status })).status).toBe(expected)
  })

  it('omits customerId when counterparty_id is null', () => {
    const result = ChargeSchema.parse(transformCharge({ ...ORDER, counterparty_id: null }))
    expect(result.customerId).toBeUndefined()
  })

  it('refuses an order without an amount or currency instead of inventing one', () => {
    const { amount: _a, ...noAmount } = ORDER
    const { currency: _c, ...noCurrency } = ORDER
    expect(() => transformCharge(noAmount as RawModernTreasuryPaymentOrder)).toThrow(/amount/)
    expect(() => transformCharge(noCurrency as RawModernTreasuryPaymentOrder)).toThrow(/currency/)
  })
})
