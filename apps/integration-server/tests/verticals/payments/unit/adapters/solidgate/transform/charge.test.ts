import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/solidgate/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { cardOrder } from '../fixtures/documented'

describe('solidgate transformCharge (card-orders report order)', () => {
  it('maps the documented example order', () => {
    const c = ChargeSchema.parse(transformCharge(cardOrder()))
    expect(c.id).toBe('923bb4e6-4a5f-41ec-81fb-28eb8a152e55')
    expect(c.externalId).toBe(c.id)
    expect(c.amount).toBe(100)
    expect(c.currency).toBe('USD')
    expect(c.status).toBe('pending')
    expect(c.customerId).toBe('93a1c659-288d-4d62-929d-10e241078faa')
    expect(c.subscriptionId).toBe('b64f6196-5d39-47a8-9bfa-3a39501c6c44')
    expect(c.description).toBe('Premium package')
    expect(c.failureCode).toBe('3.02')
    expect(c.createdAt).toBe('2026-07-15T11:45:30Z')
    expect(c.updatedAt).toBe('2026-07-16T11:45:30Z')
    expect(c.metadata).toEqual({ coupon_code: 'NY2025', partner_id: '123989' })
    expect(c.refundIds).toEqual([])
    expect(c.gateway).toBe('solidgate')
  })

  it('omits refunded and settled amounts whose currency is null', () => {
    const c = ChargeSchema.parse(transformCharge(cardOrder()))
    expect(c.amountRefunded).toBeUndefined()
    expect(c.amountCaptured).toBeUndefined()
  })

  it('keeps refunded and settled amounts in the order currency', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        ...cardOrder(),
        status: 'settle_ok',
        refund: 'partial',
        settled_amount: 100,
        settled_currency: 'USD',
        refunded_amount: 40,
        refunded_currency: 'USD',
      }),
    )
    expect(c.amountCaptured).toBe(100)
    expect(c.amountRefunded).toBe(40)
    expect(c.status).toBe('partially_refunded')
  })

  it.each([
    ['processing', 'pending'],
    ['3ds_verify', 'pending'],
    ['auth_ok', 'pending'],
    ['auth_failed', 'failed'],
    ['void_ok', 'cancelled'],
    ['settle_ok', 'succeeded'],
    ['partial_settled', 'succeeded'],
    ['refunded', 'refunded'],
    ['something_new', 'unknown'],
  ])('maps order status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...cardOrder(), status })).status).toBe(expected)
  })

  it('lists the ids of refund transactions', () => {
    const o = cardOrder()
    o.transactions.push({ ...o.transactions[0]!, id: 'tx-refund-1', operation: 'refund' })
    expect(ChargeSchema.parse(transformCharge(o)).refundIds).toEqual(['tx-refund-1'])
  })
})
