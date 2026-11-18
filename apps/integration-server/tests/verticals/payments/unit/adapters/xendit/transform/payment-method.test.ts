/**
 * Fixtures are the documented examples of the v2 Payment Method Object, its
 * Card Object and E-Wallets Object:
 * https://archive.developers.xendit.co/api-reference/payments-api/#payment-method-object
 */
import { describe, it, expect } from 'vitest'
import {
  transformPaymentMethod,
  type RawXenditPaymentMethod,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/payment-method'
import { PaymentMethodSchema } from '../../../../../../../src/verticals/payments/schema/payment-method'

/** "Payment Method Object Example" (direct debit, bank account). */
const DOC_DIRECT_DEBIT_BANK: RawXenditPaymentMethod = {
  id: 'pm-6ff0b6f2-f5de-457f-b08f-bc98fbae485a',
  card: null,
  type: 'DIRECT_DEBIT',
  status: 'ACTIVE',
  actions: [],
  country: 'PH',
  created: '2022-08-12T13:30:26.579048Z',
  ewallet: null,
  qr_code: null,
  updated: '2022-08-12T13:30:58.908220358Z',
  metadata: null,
  customer_id: 'e2878b4c-d57e-4a2c-922d-c0313c2800a3',
  description: null,
  reusability: 'MULTIPLE_USE',
  direct_debit: {
    type: 'BANK_ACCOUNT',
    debit_card: null,
    bank_account: {
      bank_account_hash: 'b4dfa99c9b60c77f2e3962b73c098945',
      masked_bank_account_number: 'XXXXXX1234',
    },
    channel_code: 'BPI',
    channel_properties: {
      failure_return_url: 'https://your-redirect-website.com/failure',
      success_return_url: 'https://your-redirect-website.com/success',
    },
  },
  failure_code: null,
  reference_id: '620b9df4-fe69-4bfd-b9d4-5cba6861db8a',
  virtual_account: null,
  over_the_counter: null,
  billing_information: null,
  direct_bank_transfer: null,
  business_id: '5f27a14a9bf05c73dd040bc8',
}

/** "Card Object Example", placed in the envelope of the Payment Method Object. */
const DOC_CARD: RawXenditPaymentMethod = {
  ...DOC_DIRECT_DEBIT_BANK,
  id: 'pm-card-1',
  type: 'CARD',
  direct_debit: null,
  card: {
    currency: 'IDR',
    channel_properties: {
      skip_three_d_secure: null,
      success_return_url: 'https://redirect.me/goodstuff',
      failure_return_url: 'https://redirect.me/badstuff',
      cardonfile_type: null,
    },
    card_information: {
      token_id: '651d1fa8e16b180017aab0f0',
      masked_card_number: '40000000XXXX1091',
      cardholder_name: 'John Doe',
      expiry_month: '12',
      expiry_year: '2040',
      type: 'CREDIT',
      network: 'VISA',
      country: 'ID',
      issuer: 'BRI',
      fingerprint: '636a577b635d29001b94f2fe',
      cardholder_email: 'johndoe@gmail.com',
      cardholder_phone_number: '628212223242526',
    },
    card_data_id: null,
    is_cvn_submitted: null,
  },
}

/** "E-Wallets Object Example", placed in the envelope of the Payment Method Object. */
const DOC_EWALLET: RawXenditPaymentMethod = {
  ...DOC_DIRECT_DEBIT_BANK,
  id: 'pm-ewallet-1',
  type: 'EWALLET',
  direct_debit: null,
  ewallet: {
    account: {
      name: 'John Doe',
      balance: null,
      point_balance: null,
      account_details: '+62123456XXXX',
    },
    channel_code: 'OVO',
    channel_properties: {
      failure_return_url: 'https://redirect.me/badstuff',
      success_return_url: 'https://redirect.me/goodstuff',
    },
  },
}

describe('xendit transformPaymentMethod', () => {
  it('maps the documented direct-debit bank account example', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC_DIRECT_DEBIT_BANK))
    expect(r.id).toBe('pm-6ff0b6f2-f5de-457f-b08f-bc98fbae485a')
    expect(r.externalId).toBe('pm-6ff0b6f2-f5de-457f-b08f-bc98fbae485a')
    expect(r.customerId).toBe('e2878b4c-d57e-4a2c-922d-c0313c2800a3')
    expect(r.type).toBe('bank_account')
    expect(r.bankName).toBe('BPI')
    expect(r.last4).toBe('1234')
    expect(r.fingerprint).toBe('b4dfa99c9b60c77f2e3962b73c098945')
    expect(r.brand).toBeUndefined()
    expect(r.gateway).toBe('xendit')
    expect(r.metadata).toEqual({
      reference_id: '620b9df4-fe69-4bfd-b9d4-5cba6861db8a',
      status: 'ACTIVE',
      reusability: 'MULTIPLE_USE',
      country: 'PH',
      business_id: '5f27a14a9bf05c73dd040bc8',
    })
    expect(r.createdAt).toBe('2022-08-12T13:30:26.579Z')
    expect(r.updatedAt).toBeDefined()
  })

  it('maps the documented direct-debit debit card last four', () => {
    const r = PaymentMethodSchema.parse(
      transformPaymentMethod({
        ...DOC_DIRECT_DEBIT_BANK,
        direct_debit: {
          type: 'DEBIT_CARD',
          debit_card: {
            mobile_number: '+62818555988',
            card_last_four: '8888',
            card_expiry: '06/24',
            email: 'email@email.com',
          },
          bank_account: null,
          channel_code: 'BRI',
        },
      }),
    )
    expect(r.last4).toBe('8888')
    expect(r.bankName).toBe('BRI')
    expect(r.fingerprint).toBeUndefined()
  })

  it('maps the documented card example from card_information', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC_CARD))
    expect(r.type).toBe('card')
    expect(r.brand).toBe('visa')
    expect(r.last4).toBe('1091')
    expect(r.expMonth).toBe(12)
    expect(r.expYear).toBe(2040)
    expect(r.holderName).toBe('John Doe')
    expect(r.fingerprint).toBe('636a577b635d29001b94f2fe')
    expect(r.bankName).toBeUndefined()
  })

  it('maps the documented e-wallet example', () => {
    const r = PaymentMethodSchema.parse(transformPaymentMethod(DOC_EWALLET))
    expect(r.type).toBe('wallet')
    expect(r.brand).toBe('ovo')
    expect(r.holderName).toBe('John Doe')
    expect(r.last4).toBeUndefined()
  })

  it('maps each documented type', () => {
    const types: Record<string, string> = {
      CARD: 'card',
      EWALLET: 'wallet',
      DIRECT_DEBIT: 'bank_account',
      VIRTUAL_ACCOUNT: 'bank_account',
      OVER_THE_COUNTER: 'other',
      QR_CODE: 'other',
      SOMETHING_NEW: 'unknown',
      // The documented values are upper-case only ("Possible values: EWALLET
      // DIRECT_DEBIT CARD ..."); a different casing is not a documented value.
      card: 'unknown',
    }
    for (const [t, want] of Object.entries(types)) {
      const r = PaymentMethodSchema.parse(
        transformPaymentMethod({ id: 'pm-x', type: t, created: DOC_CARD.created }),
      )
      expect(r.type).toBe(want)
    }
  })

  it("carries a failed method's failure_code into metadata", () => {
    // Payment Method Object: status "FAILED - For Cards Payment Methods, this means the
    // card was not successfully tokenized"; failure_code "If the status of the transaction
    // is FAILED, this describes the reason for failure". ACCOUNT_ACCESS_BLOCKED is listed
    // under "Payment Method Error Codes ... Failure Code".
    const r = PaymentMethodSchema.parse(
      transformPaymentMethod({
        ...DOC_DIRECT_DEBIT_BANK,
        status: 'FAILED',
        failure_code: 'ACCOUNT_ACCESS_BLOCKED',
      }),
    )
    expect(r.metadata?.failure_code).toBe('ACCOUNT_ACCESS_BLOCKED')
    expect(r.metadata?.status).toBe('FAILED')
  })

  it('throws on a record with no id rather than inventing one', () => {
    expect(() => transformPaymentMethod({ type: 'CARD' } as RawXenditPaymentMethod)).toThrow(/id/)
  })
})
