import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  transformSupplier,
  type KashflowCustomer,
  type KashflowSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/kashflow/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

// ── Customer fixtures ──────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<KashflowCustomer> = {}): KashflowCustomer {
  return {
    Code: 'CUST001',
    Name: 'Acme Ltd',
    DisplayName: 'Acme Industries',
    Id: 10,
    VatNumber: 'GB123456789',
    Currency: { Code: 'GBP' },
    IsArchived: false,
    CreatedDate: '2024-01-01',
    LastUpdatedDate: '2024-06-01',
    Contacts: [
      {
        Email: 'info@acme.example',
        Telephone: '01234 567890',
        Mobile: '07700 900000',
        Fax: '01234 567891',
      },
    ],
    Addresses: {
      Line1: '1 High St',
      Line2: 'Suite 10',
      Line3: 'London',
      Line4: 'Greater London',
      PostCode: 'EC1A 1BB',
      CountryCode: 'GB',
    },
    DeliveryAddresses: {
      Line1: '2 Warehouse Rd',
      Line2: undefined,
      Line3: 'Manchester',
      Line4: undefined,
      PostCode: 'M1 1AA',
      CountryCode: 'GB',
    },
    ...overrides,
  }
}

// ── Supplier fixtures ──────────────────────────────────────────────────────────

function makeSupplier(overrides: Partial<KashflowSupplier> = {}): KashflowSupplier {
  return {
    Code: 'SUPP001',
    Name: 'Widget Wholesalers',
    Id: 20,
    VatNumber: 'GB987654321',
    IsArchived: false,
    Currency: { Code: 'GBP' },
    Contacts: [
      {
        Email: 'orders@widgets.example',
        Telephone: '01111 222333',
      },
    ],
    Address: {
      Line1: '10 Industrial Park',
      Line2: undefined,
      Line3: 'Birmingham',
      Line4: 'West Midlands',
      PostCode: 'B1 1AA',
      CountryCode: 'GB',
    },
    ...overrides,
  }
}

// ── transformCustomer ──────────────────────────────────────────────────────────

describe('transformCustomer', () => {
  it('prefixes id with cust_ using Code when present', () => {
    expect(transformCustomer(makeCustomer({ Code: 'CUST001', Id: 10 })).id).toBe('cust_CUST001')
  })

  it('falls back to cust_<Id> when Code is absent', () => {
    expect(transformCustomer(makeCustomer({ Code: undefined, Id: 10 })).id).toBe('cust_10')
  })

  it('prefers DisplayName over Name for name', () => {
    const result = transformCustomer(
      makeCustomer({ DisplayName: 'Acme Industries', Name: 'Acme Ltd' }),
    )
    expect(result.name).toBe('Acme Industries')
  })

  it('falls back to Name when DisplayName is absent', () => {
    const result = transformCustomer(makeCustomer({ DisplayName: undefined, Name: 'Acme Ltd' }))
    expect(result.name).toBe('Acme Ltd')
  })

  it('maps VatNumber to taxNumber', () => {
    expect(transformCustomer(makeCustomer({ VatNumber: 'GB123456789' })).taxNumber).toBe(
      'GB123456789',
    )
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps IsArchived=false to isActive=true', () => {
    expect(transformCustomer(makeCustomer({ IsArchived: false })).isActive).toBe(true)
  })

  it('maps IsArchived=true to isActive=false', () => {
    expect(transformCustomer(makeCustomer({ IsArchived: true })).isActive).toBe(false)
  })

  it('maps IsArchived=undefined to isActive=true', () => {
    expect(transformCustomer(makeCustomer({ IsArchived: undefined })).isActive).toBe(true)
  })

  it('maps Currency.Code to currency', () => {
    expect(transformCustomer(makeCustomer({ Currency: { Code: 'GBP' } })).currency).toBe('GBP')
  })

  it('maps Contacts[0].Email to emails as WORK type', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails).toEqual([{ email: 'info@acme.example', type: 'WORK' }])
  })

  it('maps Contacts[0].Telephone as WORK, Mobile as MOBILE, Fax as FAX', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones).toEqual([
      { telephone: '01234 567890', type: 'WORK' },
      { telephone: '07700 900000', type: 'MOBILE' },
      { telephone: '01234 567891', type: 'FAX' },
    ])
  })

  it('maps Addresses object to billingAddress (Line3→city, Line4→region)', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress).toMatchObject({
      address1: '1 High St',
      address2: 'Suite 10',
      city: 'London',
      region: 'Greater London',
      postalCode: 'EC1A 1BB',
      country: 'GB',
    })
  })

  it('maps DeliveryAddresses object to shippingAddress', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.shippingAddress).toMatchObject({
      address1: '2 Warehouse Rd',
      city: 'Manchester',
      postalCode: 'M1 1AA',
      country: 'GB',
    })
  })

  it('handles Addresses as empty array (returns undefined billingAddress)', () => {
    const result = transformCustomer(makeCustomer({ Addresses: [] }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('returns undefined emails when Contacts array is empty', () => {
    const result = transformCustomer(makeCustomer({ Contacts: [] }))
    expect(result.emails).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

// ── transformSupplier ──────────────────────────────────────────────────────────

describe('transformSupplier', () => {
  it('prefixes id with supp_ using Code when present', () => {
    expect(transformSupplier(makeSupplier({ Code: 'SUPP001', Id: 20 })).id).toBe('supp_SUPP001')
  })

  it('falls back to supp_<Id> when Code is absent', () => {
    expect(transformSupplier(makeSupplier({ Code: undefined, Id: 20 })).id).toBe('supp_20')
  })

  it('maps Name to name', () => {
    expect(transformSupplier(makeSupplier({ Name: 'Widget Wholesalers' })).name).toBe(
      'Widget Wholesalers',
    )
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps IsArchived=true to isActive=false', () => {
    expect(transformSupplier(makeSupplier({ IsArchived: true })).isActive).toBe(false)
  })

  it('maps singular Address field to billingAddress', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.billingAddress).toMatchObject({
      address1: '10 Industrial Park',
      city: 'Birmingham',
      region: 'West Midlands',
      postalCode: 'B1 1AA',
      country: 'GB',
    })
  })

  it('has no shippingAddress field (suppliers use singular Address)', () => {
    const result = transformSupplier(makeSupplier())
    // Supplier transform does not set shippingAddress
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps Contacts[0].Telephone as WORK phone', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.telephones).toEqual([{ telephone: '01111 222333', type: 'WORK' }])
  })

  it('passes raw object as metadata', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })

  it('produces output that passes ContactSchema validation', () => {
    const result = transformSupplier(makeSupplier())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
