import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/rebill/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { documentedPayment } from '../fixtures/documented'

describe('rebill transformCharge', () => {
  it('maps the documented payment object', () => {
    const c = ChargeSchema.parse(transformCharge(documentedPayment()))
    expect(c.id).toBe('pay_d03f9b0c037f44e99107210bc39184fd')
    // "Payment amount as a decimal in the currency's major unit"
    expect(c.amount).toBe(1_000_000)
    expect(c.currency).toBe('ARS')
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('cus_08d93677c7ca45abbea1a0dc21b85aed')
    expect(c.paymentMethodId).toBe('crd_99b867433c3c46759ad14f5ae9046894')
    expect(c.description).toBe('Premium Plan')
    expect(c.metadata).toEqual({})
    expect(c.createdAt).toBe('2025-05-15T16:56:06.603Z')
    expect(c.updatedAt).toBe('2025-05-15T16:56:06.603Z')
  })

  it('scales a decimal major-unit amount by the currency exponent', () => {
    expect(transformCharge({ ...documentedPayment(), amount: 99.99, currency: 'USD' }).amount).toBe(
      9999,
    )
    expect(transformCharge({ ...documentedPayment(), amount: 1000, currency: 'JPY' }).amount).toBe(
      1000,
    )
  })

  it.each([
    ['pending', 'pending'],
    ['approved', 'succeeded'],
    ['rejected', 'failed'],
    ['refunded', 'refunded'],
    ['partially_refunded', 'partially_refunded'],
    ['cancelled', 'cancelled'],
    ['chargeback', 'disputed'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const c = ChargeSchema.parse(transformCharge({ ...documentedPayment(), status }))
    expect(c.status).toBe(expected)
  })

  it('carries errorDetail as the failure message', () => {
    const c = transformCharge({
      ...documentedPayment(),
      status: 'rejected',
      errorDetail: 'Insufficient funds',
    })
    expect(c.failureMessage).toBe('Insufficient funds')
  })

  it('throws rather than inventing a currency or amount', () => {
    const noCurrency = { ...documentedPayment(), currency: '' }
    expect(() => transformCharge(noCurrency)).toThrow(/no currency/)
    const noAmount = { ...documentedPayment(), amount: undefined as unknown as number }
    expect(() => transformCharge(noAmount)).toThrow(/no amount/)
  })
})

describe('rebill transformCharge subscriptionId', () => {
  // "Identifier of the subscription that triggered this payment. Prefixed with
  // `sub_`. `null` for one-time payments."
  it('carries a recurring payment subscriptionId through', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...documentedPayment(), subscriptionId: 'sub_4f1c2d3e' }),
    )
    expect(c.subscriptionId).toBe('sub_4f1c2d3e')
  })

  it('leaves subscriptionId unset for a one-time payment (documented null)', () => {
    expect(transformCharge(documentedPayment()).subscriptionId).toBeUndefined()
  })
})
