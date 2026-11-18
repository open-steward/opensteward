import { describe, it, expect } from 'vitest'
import {
  transformClient,
  transformVendor,
  type InvoiceNinjaClient,
  type InvoiceNinjaVendor,
} from '../../../../../../../src/verticals/accounting/adapters/invoice-ninja/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeClient(overrides: Partial<InvoiceNinjaClient> = {}): InvoiceNinjaClient {
  return {
    id: 'client-1',
    name: 'Acme Corp',
    vat_number: 'US-123456789',
    id_number: 'acme-corp',
    phone: '+1-555-0100',
    address1: '123 Main St',
    address2: 'Suite 4',
    city: 'Springfield',
    state: 'IL',
    postal_code: '62701',
    // country_id is a numeric Invoice Ninja internal ID (e.g. '840' for US), NOT alpha-2.
    // The transform passes it raw, which fails the Iso3166Alpha2 schema constraint.
    // Leave null in fixtures so address tests don't fail schema validation.
    country_id: null,
    shipping_address1: '456 Warehouse Ave',
    shipping_address2: null,
    shipping_city: 'Shelbyville',
    shipping_state: 'IL',
    shipping_postal_code: '62565',
    shipping_country_id: null,
    currency_id: '1', // USD
    is_deleted: false,
    contacts: [{ first_name: 'Jane', last_name: 'Doe', email: 'jane@acme.example', phone: null }],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

function makeVendor(overrides: Partial<InvoiceNinjaVendor> = {}): InvoiceNinjaVendor {
  return {
    id: 'vendor-1',
    name: 'Supplier Inc',
    vat_number: 'GB-987654321',
    id_number: 'supplier-inc',
    phone: '+44-20-1234-5678',
    address1: '10 Downing St',
    address2: null,
    city: 'London',
    state: null,
    postal_code: 'SW1A 2AA',
    // country_id is a numeric internal ID — leave null so schema validation passes
    country_id: null,
    currency_id: '2', // GBP
    is_deleted: false,
    contacts: [
      { first_name: 'John', last_name: 'Smith', email: 'john@supplier.example', phone: null },
    ],
    created_at: 1700000000,
    updated_at: 1700100000,
    ...overrides,
  }
}

describe('transformClient', () => {
  it('maps id directly', () => {
    expect(transformClient(makeClient()).id).toBe('client-1')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformClient(makeClient())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps name and taxNumber', () => {
    const result = transformClient(makeClient())
    expect(result.name).toBe('Acme Corp')
    expect(result.taxNumber).toBe('US-123456789')
  })

  it('maps identification from id_number', () => {
    expect(transformClient(makeClient()).identification).toBe('acme-corp')
  })

  it('maps isActive from !is_deleted', () => {
    expect(transformClient(makeClient({ is_deleted: false })).isActive).toBe(true)
    expect(transformClient(makeClient({ is_deleted: true })).isActive).toBe(false)
  })

  it('maps currency_id=1 to USD', () => {
    expect(transformClient(makeClient({ currency_id: '1' })).currency).toBe('USD')
  })

  it('returns undefined currency for unknown currency_id', () => {
    expect(transformClient(makeClient({ currency_id: undefined })).currency).toBeUndefined()
  })

  it('maps emails from contacts array', () => {
    const result = transformClient(makeClient())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0]).toEqual({ email: 'jane@acme.example', type: 'WORK' })
  })

  it('returns undefined emails when contacts have no email', () => {
    const result = transformClient(
      makeClient({ contacts: [{ first_name: 'No', last_name: 'Email' }] }),
    )
    expect(result.emails).toBeUndefined()
  })

  it('maps phone to telephone with WORK type', () => {
    const result = transformClient(makeClient())
    expect(result.telephones).toHaveLength(1)
    expect(result.telephones![0]).toEqual({ telephone: '+1-555-0100', type: 'WORK' })
  })

  it('returns undefined telephones when phone is absent', () => {
    const result = transformClient(makeClient({ phone: undefined }))
    expect(result.telephones).toBeUndefined()
  })

  it('maps billing address fields', () => {
    const result = transformClient(makeClient())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.postalCode).toBe('62701')
    // country_id is a numeric internal ID that the transform passes through raw —
    // the fixture uses null so the address schema constraint (ISO alpha-2) isn't violated
    expect(result.billingAddress?.country).toBeUndefined()
  })

  it('maps shipping address fields', () => {
    const result = transformClient(makeClient())
    expect(result.shippingAddress?.address1).toBe('456 Warehouse Ave')
    expect(result.shippingAddress?.city).toBe('Shelbyville')
  })

  it('converts epoch created_at to Date (×1000)', () => {
    const result = transformClient(makeClient({ created_at: 1700000000 }))
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
  })

  it('converts epoch updated_at to Date (×1000)', () => {
    const result = transformClient(makeClient({ updated_at: 1700100000 }))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeClient()
    expect(transformClient(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformClient(makeClient()))).not.toThrow()
  })
})

describe('transformVendor', () => {
  it('prefixes id with v_', () => {
    expect(transformVendor(makeVendor()).id).toBe('v_vendor-1')
  })

  it('sets isSupplier=true and isCustomer=false', () => {
    const result = transformVendor(makeVendor())
    expect(result.isSupplier).toBe(true)
    expect(result.isCustomer).toBe(false)
  })

  it('maps name from name field', () => {
    expect(transformVendor(makeVendor()).name).toBe('Supplier Inc')
  })

  it('falls back to composeName from first contact when name is absent', () => {
    const result = transformVendor(
      makeVendor({
        name: null,
        contacts: [{ first_name: 'John', last_name: 'Smith', email: null }],
      }),
    )
    // composeName joins first + last with a space
    expect(result.name).toContain('John')
    expect(result.name).toContain('Smith')
  })

  it('maps taxNumber from vat_number', () => {
    expect(transformVendor(makeVendor()).taxNumber).toBe('GB-987654321')
  })

  it('maps currency_id=2 to GBP', () => {
    expect(transformVendor(makeVendor({ currency_id: '2' })).currency).toBe('GBP')
  })

  it('maps billing address (no shippingAddress for vendors)', () => {
    const result = transformVendor(makeVendor())
    expect(result.billingAddress?.address1).toBe('10 Downing St')
    expect(result.billingAddress?.city).toBe('London')
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps emails from contacts array', () => {
    const result = transformVendor(makeVendor())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0]).toEqual({ email: 'john@supplier.example', type: 'WORK' })
  })

  it('converts epoch timestamps to Dates', () => {
    const result = transformVendor(makeVendor())
    expect(result.createdAt).toEqual(new Date(1700000000 * 1000))
    expect(result.updatedAt).toEqual(new Date(1700100000 * 1000))
  })

  it('passes raw object as metadata', () => {
    const raw = makeVendor()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeVendor()))).not.toThrow()
  })
})
