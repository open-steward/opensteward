/**
 * Ordergroove Customer → canonical Customer.
 *
 * Raw shape confirmed verbatim at
 * https://developer.ordergroove.com/reference/customers-retrieve; the create
 * body's required-field list is confirmed at
 * https://developer.ordergroove.com/reference/customers-create.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  buildCreateCustomerBody,
  type RawOrdergrooveCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/ordergroove/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'
import type { Customer } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawOrdergrooveCustomer> = {}): RawOrdergrooveCustomer {
  return {
    merchant: 'ac4f7938383a11e89ecbbc764e1107f2',
    merchant_user_id: '00026001',
    first_name: 'Nathan',
    last_name: 'Torres',
    email: 'nathan.torres@ordergroove.com',
    phone_number: '+13154055372',
    created: '2018-10-10 14:43:32',
    last_updated: '2018-11-15 21:44:19',
    ...overrides,
  }
}

describe('ordergroove transformCustomer', () => {
  it('maps merchant_user_id as the canonical id', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('00026001')
  })

  it('maps name, email and phone', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.firstName).toBe('Nathan')
    expect(result.lastName).toBe('Torres')
    expect(result.email).toBe('nathan.torres@ordergroove.com')
    expect(result.phone).toBe('+13154055372')
  })

  it('converts the space-separated created/last_updated timestamps to ISO 8601 UTC', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBe('2018-10-10T14:43:32.000Z')
    expect(result.updatedAt).toBe('2018-11-15T21:44:19.000Z')
  })

  it('preserves the raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('ordergroove buildCreateCustomerBody', () => {
  const MERCHANT_ID = 'ac4f7938383a11e89ecbbc764e1107f2'

  // Every field the Body Params table at
  // developer.ordergroove.com/reference/customers-create marks required
  // and this adapter cannot source from the canonical `Customer` shape.
  const REQUIRED_METADATA = {
    session_id: '5bda04dc429d11e4bd78bc764e106cf4.463053.1418160308',
    user_token_id: 'bda1c6b0084811e6965ebc764e106cf4',
    phone_type: 2,
    locale: 'en-US',
  }

  const base: Partial<Customer> = {
    id: '00026001',
    email: 'nathan.torres@ordergroove.com',
    firstName: 'Nathan',
    lastName: 'Torres',
    phone: '+13154055372',
  }

  const withRequiredMetadata: Partial<Customer> = { ...base, metadata: REQUIRED_METADATA }

  it('throws when email is missing', () => {
    expect(() => buildCreateCustomerBody({ id: '1', firstName: 'A', lastName: 'B' })).toThrow(/email/)
  })

  it('throws when no merchant id is available', () => {
    expect(() => buildCreateCustomerBody(withRequiredMetadata)).toThrow(/merchant/)
  })

  it('throws when id (merchant_user_id) is missing', () => {
    expect(() =>
      buildCreateCustomerBody({ email: 'a@b.com' }, { merchantId: 'ac4f7938' }),
    ).toThrow(/merchant_user_id/)
  })

  it.each([
    ['firstName', 'first_name'],
    ['lastName', 'last_name'],
    ['phone', 'phone_number'],
  ] as const)(
    'throws naming %s (%s) rather than sending an invented empty string',
    (canonicalField, ogField) => {
      const data = { ...withRequiredMetadata }
      delete (data as Record<string, unknown>)[canonicalField]
      expect(() => buildCreateCustomerBody(data, { merchantId: MERCHANT_ID })).toThrow(
        new RegExp(ogField),
      )
    },
  )

  it.each(['session_id', 'user_token_id', 'phone_type', 'locale'] as const)(
    'throws naming %s rather than inventing one, when metadata does not supply it',
    (field) => {
      const metadata = { ...REQUIRED_METADATA }
      delete (metadata as Record<string, unknown>)[field]
      expect(() =>
        buildCreateCustomerBody({ ...base, metadata }, { merchantId: MERCHANT_ID }),
      ).toThrow(new RegExp(field))
    },
  )

  it('a minimal valid input sends no invented fields', () => {
    const body = buildCreateCustomerBody(withRequiredMetadata, { merchantId: MERCHANT_ID })

    // Every value came from either the caller's data/metadata, or one of
    // the two documented defaults (`live: true` from the docs' own example
    // request; `created`/`last_updated` = now, both true at creation time).
    expect(body).toEqual({
      merchant: MERCHANT_ID,
      merchant_user_id: '00026001',
      session_id: REQUIRED_METADATA.session_id,
      user_token_id: REQUIRED_METADATA.user_token_id,
      first_name: 'Nathan',
      last_name: 'Torres',
      email: 'nathan.torres@ordergroove.com',
      phone_number: '+13154055372',
      phone_type: 2,
      live: true,
      created: expect.any(String),
      last_updated: expect.any(String),
      locale: 'en-US',
    })
    // No fabricated login event, and no optional fields the caller never supplied.
    expect(body).not.toHaveProperty('last_login')
    expect(body).not.toHaveProperty('extra_data')
    expect(body).not.toHaveProperty('experiences')
    expect(body).not.toHaveProperty('price_code')
  })

  it('only sends last_login when the caller explicitly supplies one', () => {
    const withLogin = buildCreateCustomerBody(
      { ...base, metadata: { ...REQUIRED_METADATA, last_login: '2026-01-01 00:00:00' } },
      { merchantId: MERCHANT_ID },
    )
    expect(withLogin['last_login']).toBe('2026-01-01 00:00:00')

    const withoutLogin = buildCreateCustomerBody(withRequiredMetadata, { merchantId: MERCHANT_ID })
    expect(withoutLogin).not.toHaveProperty('last_login')
  })

  it('lets metadata override the documented defaults, including the merchant id', () => {
    const body = buildCreateCustomerBody(
      { ...base, metadata: { ...REQUIRED_METADATA, merchant: 'override-merchant', locale: 'fr-FR', live: false } },
      { merchantId: MERCHANT_ID },
    )
    expect(body['merchant']).toBe('override-merchant')
    expect(body['locale']).toBe('fr-FR')
    expect(body['live']).toBe(false)
  })
})
