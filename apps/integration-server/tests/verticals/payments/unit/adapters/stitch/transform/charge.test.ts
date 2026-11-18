/**
 * Fixture: the documented PaymentInitiationRequest example payload
 * (https://docs.stitch.money/payment-products/payins/paybybank/integration-process),
 * trimmed to the fields the adapter's query selects.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawStitchPaymentRequest,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOC_EXAMPLE: RawStitchPaymentRequest = {
  amount: { currency: 'ZAR', quantity: '1' },
  beneficiaryReference: 'KombuchaFizz',
  created: '2022-10-11T09:52:13.312Z',
  externalReference: '79261d16-c53b-48eb-9019-dc9cfb6c5126',
  id: 'cGF5cmVxLzk2YjUyODU1LTBkMzQtNDI0MS04YmM2LWE4ODBlMDQ1ZGQzOQ==',
  state: { __typename: 'PaymentInitiationRequestCompleted', date: '2022-10-11T09:52:53.114Z' },
  updated: '2022-10-11T09:52:53.128Z',
}

describe('stitch transformCharge (PaymentInitiationRequest)', () => {
  it('maps the documented example and parses as a canonical Charge', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_EXAMPLE))
    expect(c.id).toBe(DOC_EXAMPLE.id)
    expect(c.externalId).toBe(DOC_EXAMPLE.id)
    expect(c.amount).toBe(100)
    expect(c.currency).toBe('ZAR')
    expect(c.status).toBe('succeeded')
    expect(c.statementDescriptor).toBe('KombuchaFizz')
    expect(c.createdAt).toBe('2022-10-11T09:52:13.312Z')
    expect(c.updatedAt).toBe('2022-10-11T09:52:53.128Z')
    expect(c.gateway).toBe('stitch')
  })

  it('converts a decimal-string quantity in major units to minor units', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...DOC_EXAMPLE, amount: { currency: 'ZAR', quantity: '280.00' } }),
    )
    expect(c.amount).toBe(28000)
    const c2 = ChargeSchema.parse(
      transformCharge({ ...DOC_EXAMPLE, amount: { currency: 'ZAR', quantity: '4.25' } }),
    )
    expect(c2.amount).toBe(425)
  })

  it.each([
    ['PaymentInitiationRequestPending', 'pending'],
    ['PaymentInitiationRequestCompleted', 'succeeded'],
    ['PaymentInitiationRequestCancelled', 'cancelled'],
    ['PaymentInitiationRequestExpired', 'cancelled'],
    ['PaymentInitiationRequestManuallyCompleted', 'unknown'],
  ])('maps state %s to %s', (typename, status) => {
    const c = ChargeSchema.parse(
      transformCharge({ ...DOC_EXAMPLE, state: { __typename: typename } }),
    )
    expect(c.status).toBe(status)
  })

  it('carries a cancelled request reason as failureMessage', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        ...DOC_EXAMPLE,
        state: {
          __typename: 'PaymentInitiationRequestCancelled',
          date: '2022-10-11T09:52:53.114Z',
          reason: 'payer declined',
        },
      }),
    )
    expect(c.failureMessage).toBe('payer declined')
  })

  it('throws rather than inventing an amount or currency', () => {
    expect(() => transformCharge({ ...DOC_EXAMPLE, amount: undefined as never })).toThrow(/amount/)
    expect(() =>
      transformCharge({ ...DOC_EXAMPLE, amount: { quantity: '1', currency: '' } }),
    ).toThrow(/amount/)
    expect(() =>
      transformCharge({ ...DOC_EXAMPLE, amount: { quantity: '', currency: 'ZAR' } }),
    ).toThrow(/amount/)
  })

  it('carries the documented metadata Json as a string map', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...DOC_EXAMPLE, metadata: { orderId: 'ord_1', attempt: 2 } }),
    )
    expect(c.metadata).toEqual({ orderId: 'ord_1', attempt: '2' })
  })

  it('throws on a missing id', () => {
    expect(() => transformCharge({ ...DOC_EXAMPLE, id: '' })).toThrow(/id/)
  })
})
