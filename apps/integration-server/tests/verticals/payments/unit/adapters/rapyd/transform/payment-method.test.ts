/**
 * Fixtures: rows of the List Payment Methods of Customer response example,
 * https://docs.rapyd.net/en/list-payment-methods-of-customer.html.
 */
import { describe, it, expect } from 'vitest'
import { transformPaymentMethod } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

const CUSTOMER = 'cus_4e25112ac20e144ad073a614dc46934b'

const DOC_CARD = {
  id: 'card_b9548d9b53a565b2315fecdc6c87f158',
  type: 'gb_visa_card',
  category: 'card',
  metadata: {},
  image: 'https://iconslib.rapyd.net/checkout/gb_visa_card.png',
  webhook_url: '',
  supporting_documentation: '',
  next_action: 'not_applicable',
  name: 'John Doe',
  last4: '1111',
  acs_check: 'unchecked',
  cvv_check: 'unchecked',
  bin_details: {
    type: 'DEBIT',
    brand: 'VISA',
    level: 'CLASSIC',
    issuer: 'CONOTOXIA SP. Z O.O',
    country: 'PL',
    bin_number: '411111',
  },
  expiration_year: '35',
  expiration_month: '12',
  fingerprint_token: 'ocfp_e599f990674473ce6283b245e9ad2467',
  network_reference_id: '507150',
}

const DOC_EWALLET = {
  id: 'other_9a1fa177940e16c09f161cfa55ec108a',
  type: 'sg_grabpay_ewallet',
  category: 'ewallet',
  metadata: {},
  image: 'https://iconslib.rapyd.net/checkout/sg_grabpay_ewallet.png',
  next_action: 'not_applicable',
  bic_swift: '',
  account_last4: '',
}

describe('rapyd transformPaymentMethod', () => {
  it('maps the documented card row and parses as a canonical PaymentMethod', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC_CARD, CUSTOMER))
    expect(r.id).toBe('card_b9548d9b53a565b2315fecdc6c87f158')
    expect(r.externalId).toBe(r.id)
    expect(r.customerId).toBe(CUSTOMER)
    expect(r.type).toBe('card')
    expect(r.brand).toBe('VISA')
    expect(r.last4).toBe('1111')
    expect(r.expMonth).toBe(12)
    // "35" is two digits; the docs do not say which century.
    expect(r.expYear).toBeUndefined()
    expect(r.holderName).toBe('John Doe')
    expect(r.fingerprint).toBe('ocfp_e599f990674473ce6283b245e9ad2467')
    expect(r.gateway).toBe('rapyd')
  })

  it('takes a four-digit expiration_year', () => {
    const r = PaymentMethodSchema.parse(
      transformPaymentMethod({ ...DOC_CARD, expiration_year: '2035' }, CUSTOMER),
    )
    expect(r.expYear).toBe(2035)
  })

  it('leaves out a numeric two-digit expiration_year as well as the documented string "35"', () => {
    const r = PaymentMethodSchema.parse(
      transformPaymentMethod({ ...DOC_CARD, expiration_year: 35 }, CUSTOMER),
    )
    expect(r.expYear).toBeUndefined()
  })

  it('maps the documented ewallet row', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC_EWALLET, CUSTOMER))
    expect(r.type).toBe('wallet')
    expect(r.last4).toBeUndefined()
    expect(r.brand).toBeUndefined()
  })

  it.each([
    ['card', 'card'],
    ['card_redirect', 'card'],
    ['bank_transfer', 'bank_account'],
    ['bank_redirect', 'a2a'],
    ['ewallet', 'wallet'],
    ['ewallet_redirect', 'wallet'],
    ['cash', 'other'],
    ['mystery', 'unknown'],
  ])('maps documented category %s to %s', (category, want) => {
    expect(
      PaymentMethodSchema.parse(transformPaymentMethod({ ...DOC_EWALLET, category }, CUSTOMER))
        .type,
    ).toBe(want)
  })

  it('throws on a row with no id', () => {
    expect(() => transformPaymentMethod({ ...DOC_CARD, id: undefined }, CUSTOMER)).toThrow(/id/)
  })
})
