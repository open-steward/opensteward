import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type OdooPartner,
} from '../../../../../../../src/verticals/accounting/adapters/odoo/transform/contact'

function makeContact(overrides: Partial<OdooPartner> = {}): OdooPartner {
  return {
    id: 10,
    name: 'Jane Doe',
    company_name: 'Acme Corp',
    email: 'jane@acme.com',
    phone: '+1-555-0100',
    mobile: undefined,
    vat: 'FR12345678901',
    active: true,
    customer_rank: 1,
    supplier_rank: 0,
    street: '1 Main St',
    city: 'Paris',
    zip: '75001',
    country_id: [76, 'France'],
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps id correctly', () => {
    expect(transformContact(makeContact()).id).toBe('10')
  })

  it('maps name correctly', () => {
    expect(transformContact(makeContact()).name).toBe('Jane Doe')
  })

  it('maps company_name to companyName', () => {
    expect(transformContact(makeContact()).companyName).toBe('Acme Corp')
  })

  it('maps vat to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('FR12345678901')
  })

  it('maps customer_rank > 0 to isCustomer true', () => {
    expect(transformContact(makeContact({ customer_rank: 1 })).isCustomer).toBe(true)
  })

  it('maps customer_rank 0 to isCustomer false', () => {
    expect(transformContact(makeContact({ customer_rank: 0 })).isCustomer).toBe(false)
  })

  it('maps supplier_rank > 0 to isSupplier true', () => {
    expect(transformContact(makeContact({ supplier_rank: 2 })).isSupplier).toBe(true)
  })

  it('maps supplier_rank 0 to isSupplier false', () => {
    expect(transformContact(makeContact({ supplier_rank: 0 })).isSupplier).toBe(false)
  })

  it('maps active to isActive', () => {
    expect(transformContact(makeContact({ active: false })).isActive).toBe(false)
  })

  it('maps email into emails array', () => {
    expect(transformContact(makeContact()).emails).toEqual([{ email: 'jane@acme.com' }])
  })

  it('maps phone into telephones array as WORK', () => {
    expect(transformContact(makeContact()).telephones).toEqual([
      { telephone: '+1-555-0100', type: 'WORK' },
    ])
  })

  it('includes mobile telephone when present', () => {
    const result = transformContact(makeContact({ mobile: '+1-555-0199' }))
    expect(result.telephones).toEqual([
      { telephone: '+1-555-0100', type: 'WORK' },
      { telephone: '+1-555-0199', type: 'MOBILE' },
    ])
  })

  it('maps billing address fields', () => {
    const addr = transformContact(makeContact()).billingAddress
    expect(addr?.address1).toBe('1 Main St')
    expect(addr?.city).toBe('Paris')
    expect(addr?.postalCode).toBe('75001')
    expect(addr?.country).toBe('FR')
  })

  it('prefers country_code over the locale-translated country_id display name', () => {
    // On a German-locale Odoo session, country_id's many2one display_name
    // comes back translated ('Deutschland', not 'Germany') and would not
    // resolve through toIso3166Alpha2 on its own. country_code is Odoo's
    // own locale-independent field (res.partner.country_code, related
    // country_id.code) and must win whenever it's present.
    const result = transformContact(
      makeContact({ country_code: 'DE', country_id: [59, 'Deutschland'] }),
    )
    expect(result.billingAddress?.country).toBe('DE')
  })

  it('falls back to normalising the country_id display name when country_code is absent', () => {
    const result = transformContact(
      makeContact({ country_code: undefined, country_id: [76, 'France'] }),
    )
    expect(result.billingAddress?.country).toBe('FR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
