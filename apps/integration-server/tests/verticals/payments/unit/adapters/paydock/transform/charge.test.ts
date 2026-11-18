import { describe, it, expect } from 'vitest'
import {
  mapChargeStatus,
  transformCharge,
} from '../../../../../../../src/verticals/payments/adapters/paydock/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { DOC_CHARGE } from '../fixtures/docs'

describe('paydock transformCharge', () => {
  it('maps the documented charges/search example', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_CHARGE))
    expect(c.id).toBe('5ec63451b12c99579e46ee31')
    // "amount + float Amount of payment": major units, AUD has 2 decimals
    expect(c.amount).toBe(1000)
    expect(c.currency).toBe('AUD')
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('5e4bfbd86d244b438451fbd7')
    expect(c.createdAt).toBe('2020-05-21T07:57:05.911Z')
    expect(c.updatedAt).toBe('2020-05-21T07:57:06.565Z')
    expect(c.metadata).toEqual({})
  })

  it('scales a fractional amount by the currency exponent', () => {
    expect(transformCharge({ ...DOC_CHARGE, amount: 12.34 }).amount).toBe(1234)
    expect(transformCharge({ ...DOC_CHARGE, amount: 500, currency: 'JPY' }).amount).toBe(500)
  })

  it('reads subscription_id', () => {
    const c = transformCharge({ ...DOC_CHARGE, subscription_id: '5ec7b20ab12c99579e46f26b' })
    expect(c.subscriptionId).toBe('5ec7b20ab12c99579e46f26b')
  })

  it('maps the documented Status table values and nothing else', () => {
    expect(mapChargeStatus('complete')).toBe('succeeded')
    expect(mapChargeStatus('pending')).toBe('pending')
    expect(mapChargeStatus('requested')).toBe('pending')
    expect(mapChargeStatus('failed')).toBe('failed')
    expect(mapChargeStatus('declined')).toBe('failed')
    expect(mapChargeStatus('refunded')).toBe('refunded')
    expect(mapChargeStatus('refund_requested')).toBe('succeeded')
    expect(mapChargeStatus('cancelled')).toBe('cancelled')
    expect(mapChargeStatus('paid')).toBe('unknown')
    expect(mapChargeStatus(undefined)).toBe('unknown')
  })

  it('throws without a documented amount or currency rather than defaulting', () => {
    const { currency: _c, ...noCurrency } = DOC_CHARGE
    const { amount: _a, ...noAmount } = DOC_CHARGE
    expect(() => transformCharge(noCurrency)).toThrow(/amount\/currency/)
    expect(() => transformCharge(noAmount)).toThrow(/amount\/currency/)
    expect(() => transformCharge({ amount: 1, currency: 'AUD' })).toThrow(/_id/)
  })

  it('upper-cases a lower-case documented currency code', () => {
    const c = ChargeSchema.parse(transformCharge({ ...DOC_CHARGE, currency: 'aud' }))
    expect(c.currency).toBe('AUD')
  })
})
