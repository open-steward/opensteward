import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/peach-payments/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { DOC_DEBIT } from '../fixtures'

describe('peach-payments transformCharge', () => {
  it('maps the documented DB record', () => {
    const result = ChargeSchema.parse(transformCharge(DOC_DEBIT))
    expect(result.id).toBe('8ac7a4a0856290ba01856ad6026c7997')
    expect(result.externalId).toBe('8ac7a4a0856290ba01856ad6026c7997')
    expect(result.amount).toBe(12300)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('succeeded')
    expect(result.captured).toBe(true)
    expect(result.paymentMethodId).toBe('8ac7a49f852afebf01852b0fb0ee36c3')
    expect(result.failureCode).toBeUndefined()
    expect(result.createdAt).toBe('2023-01-01T00:58:08.442Z')
    expect(result.metadata).toEqual({
      StandingInstructionAPI: 'true',
      CTPE_DESCRIPTOR_TEMPLATE: '',
      FEEDZAI_DATA_FEED: 'true',
      StoredCredentialType: 'CIT_STORED',
    })
    expect(result.gateway).toBe('peach-payments')
  })

  it('scales by the currency exponent, not a fixed 100', () => {
    const result = ChargeSchema.parse(
      transformCharge({ ...DOC_DEBIT, amount: '500.00', currency: 'JPY' }),
    )
    expect(result.amount).toBe(500)
  })

  it('upper-cases a lower-case currency, which the response table allows', () => {
    // oppwa-references-api, "Payment response parameters": `currency` is
    // "A3 `[a-zA-Z]{3}`"; the canonical Iso4217Currency is upper-case.
    const result = ChargeSchema.parse(transformCharge({ ...DOC_DEBIT, currency: 'gbp' }))
    expect(result.currency).toBe('GBP')
    expect(result.amount).toBe(12300)
  })

  it('marks a PA record as not captured', () => {
    const result = ChargeSchema.parse(transformCharge({ ...DOC_DEBIT, paymentType: 'PA' }))
    expect(result.captured).toBe(false)
  })

  it.each([
    ['000.100.110', 'succeeded'],
    ['000.400.100', 'succeeded'],
    ['000.200.000', 'pending'],
    ['100.400.500', 'pending'],
    ['800.100.151', 'failed'],
    ['000.100.200', 'disputed'],
    ['123.456.789', 'unknown'],
  ])('maps result.code %s to %s', (code, status) => {
    const result = ChargeSchema.parse(
      transformCharge({ ...DOC_DEBIT, result: { code, description: 'd' } }),
    )
    expect(result.status).toBe(status)
  })

  it('carries a rejection code and description as the failure', () => {
    const result = ChargeSchema.parse(
      transformCharge({
        ...DOC_DEBIT,
        result: { code: '800.100.151', description: 'transaction declined (invalid card)' },
      }),
    )
    expect(result.failureCode).toBe('800.100.151')
    expect(result.failureMessage).toBe('transaction declined (invalid card)')
  })

  it('throws rather than inventing a missing amount, currency or id', () => {
    const { amount: _a, ...noAmount } = DOC_DEBIT
    const { currency: _c, ...noCurrency } = DOC_DEBIT
    const { id: _i, ...noId } = DOC_DEBIT
    expect(() => transformCharge(noAmount)).toThrow(/amount/)
    expect(() => transformCharge(noCurrency)).toThrow(/currency/)
    expect(() => transformCharge(noId)).toThrow(/id/)
  })
})
