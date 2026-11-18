import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/yoco/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { PAYMENT } from '../fixtures'

describe('yoco transformCharge (documented Payment)', () => {
  it('maps the documented example payment', () => {
    const c = ChargeSchema.parse(transformCharge(PAYMENT))
    expect(c.id).toBe('1732194482873-c777dc85-035e-40de-9820-765fde5ded7b')
    expect(c.externalId).toBe(c.id)
    expect(c.amount).toBe(27500)
    expect(c.currency).toBe('ZAR')
    expect(c.amountRefunded).toBe(0)
    expect(c.status).toBe('succeeded')
    expect(c.description).toBe('Payment receipt #491352')
    expect(c.refundIds).toEqual(['1732188199292-2a8752ab-db45-4507-9d85-fcc6049beef3'])
    expect(c.createdAt).toBe('2024-11-19T15:27:02+00:00')
    expect(c.updatedAt).toBe('2024-11-19T16:27:23+00:00')
    expect(c.metadata).toMatchObject({
      receipt_number: '491352',
      payment_method: 'card',
      payment_source: 'payment_link',
      external_id: 'order-123',
    })
    expect(c.gateway).toBe('yoco')
  })

  it.each([
    ['approved', 'succeeded'],
    ['cancelled', 'cancelled'],
    ['failed', 'failed'],
    ['pending', 'pending'],
    ['something-new', 'unknown'],
  ])('maps PaymentStatus %s to %s', (status, want) => {
    expect(ChargeSchema.parse(transformCharge({ ...PAYMENT, status })).status).toBe(want)
  })

  it('throws rather than inventing an amount when total_amount is missing', () => {
    const { total_amount: _drop, ...rest } = PAYMENT
    expect(() => transformCharge(rest as typeof PAYMENT)).toThrow(/total_amount/)
  })

  it('rejects a non-integer amount (Money is documented in minor units)', () => {
    expect(() =>
      transformCharge({ ...PAYMENT, total_amount: { ...PAYMENT.total_amount, amount: 12.5 } }),
    ).toThrow(/total_amount/)
  })

  it('upper-cases the Money currency code for the canonical schema', () => {
    const c = transformCharge({
      ...PAYMENT,
      total_amount: { ...PAYMENT.total_amount, currency: 'zar' },
    })
    expect(ChargeSchema.parse(c).currency).toBe('ZAR')
  })

  it('throws rather than inventing an id', () => {
    expect(() => transformCharge({ ...PAYMENT, id: '' })).toThrow(/missing id/)
  })
})
