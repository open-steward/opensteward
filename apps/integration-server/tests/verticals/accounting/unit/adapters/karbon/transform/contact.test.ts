import { describe, it, expect } from 'vitest'
import {
  transformContact,
  transformOrganization,
  type KarbonContact,
  type KarbonOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/karbon/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeContact(overrides: Partial<KarbonContact> = {}): KarbonContact {
  return {
    ContactKey: 'contact-001',
    FullName: 'Jane Doe',
    EmailAddress: 'jane@example.com',
    PhoneNumber: '555-1234',
    MobilePhoneNumber: '555-9999',
    FaxNumber: '555-0000',
    AddressLine: '123 Main St',
    City: 'Austin',
    StateProvinceCounty: 'TX',
    ZipCode: '78701',
    Country: 'US',
    UserDefinedIdentifier: 'jane-doe-id',
    LastModifiedDateTime: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

function makeOrganization(overrides: Partial<KarbonOrganization> = {}): KarbonOrganization {
  return {
    OrganizationKey: 'org-001',
    FullName: 'Acme Corp',
    LegalName: 'Acme Corporation Inc.',
    EmailAddress: 'info@acme.com',
    PhoneNumber: '555-2000',
    AddressLine: '1 Corp Ave',
    City: 'Dallas',
    StateProvinceCounty: 'TX',
    ZipCode: '75001',
    Country: 'US',
    UserDefinedIdentifier: 'acme-corp',
    LastModifiedDateTime: '2024-03-10T08:30:00.000Z',
    ...overrides,
  }
}

// ── transformContact ──────────────────────────────────────────────────────────

describe('transformContact', () => {
  it('maps ContactKey to id', () => {
    expect(transformContact(makeContact()).id).toBe('contact-001')
  })

  it('maps FullName to name', () => {
    expect(transformContact(makeContact()).name).toBe('Jane Doe')
  })

  it('maps UserDefinedIdentifier to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('jane-doe-id')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const c = transformContact(makeContact())
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(false)
  })

  it('falls back to top-level EmailAddress when no BusinessCard', () => {
    const c = transformContact(makeContact({ BusinessCard: undefined }))
    expect(c.emails?.[0]).toEqual({ email: 'jane@example.com', type: 'WORK' })
  })

  it('falls back to top-level phone fields when no BusinessCard', () => {
    const c = transformContact(makeContact({ BusinessCard: undefined }))
    expect(c.telephones).toContainEqual({ telephone: '555-1234', type: 'WORK' })
    expect(c.telephones).toContainEqual({ telephone: '555-9999', type: 'MOBILE' })
    expect(c.telephones).toContainEqual({ telephone: '555-0000', type: 'FAX' })
  })

  it('prefers BusinessCard emails over top-level EmailAddress', () => {
    const c = transformContact(
      makeContact({
        EmailAddress: 'fallback@example.com',
        BusinessCard: {
          EmailAddresses: ['card@example.com'],
        },
      }),
    )
    expect(c.emails?.[0]).toEqual({ email: 'card@example.com', type: 'WORK' })
    expect(c.emails).toHaveLength(1)
  })

  it('maps BusinessCard phone labels correctly', () => {
    const c = transformContact(
      makeContact({
        BusinessCard: {
          PhoneNumbers: [
            { Number: '111', Label: 'mobile' },
            { Number: '222', Label: 'home' },
            { Number: '333', Label: 'other' },
            { Number: '444', Label: 'work' },
            { Number: '555', Label: undefined },
          ],
        },
      }),
    )
    expect(c.telephones).toContainEqual({ telephone: '111', type: 'MOBILE' })
    expect(c.telephones).toContainEqual({ telephone: '222', type: 'HOME' })
    expect(c.telephones).toContainEqual({ telephone: '333', type: 'OTHER' })
    expect(c.telephones).toContainEqual({ telephone: '444', type: 'WORK' })
    expect(c.telephones).toContainEqual({ telephone: '555', type: 'WORK' })
  })

  it('maps BusinessCard address over top-level address fields', () => {
    const c = transformContact(
      makeContact({
        BusinessCard: {
          Addresses: [
            {
              AddressLines: '99 Card St',
              City: 'Houston',
              StateProvinceCounty: 'TX',
              ZipCode: '77001',
              CountryCode: 'US',
            },
          ],
        },
      }),
    )
    expect(c.billingAddress?.address1).toBe('99 Card St')
    expect(c.billingAddress?.city).toBe('Houston')
    expect(c.billingAddress?.postalCode).toBe('77001')
    expect(c.billingAddress?.country).toBe('US')
    expect(c.billingAddress?.region).toBe('TX')
  })

  it('falls back to top-level address when no BusinessCard address', () => {
    const c = transformContact(makeContact({ BusinessCard: undefined }))
    expect(c.billingAddress?.address1).toBe('123 Main St')
    expect(c.billingAddress?.city).toBe('Austin')
    expect(c.billingAddress?.postalCode).toBe('78701')
    expect(c.billingAddress?.country).toBe('US')
  })

  it('parses LastModifiedDateTime to a Date for updatedAt', () => {
    const c = transformContact(makeContact())
    expect(c.updatedAt).toBeInstanceOf(Date)
    expect(c.updatedAt?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
  })

  it('sets updatedAt to undefined when LastModifiedDateTime is absent', () => {
    const c = transformContact(makeContact({ LastModifiedDateTime: undefined }))
    expect(c.updatedAt).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => ContactSchema.parse(transformContact(makeContact()))).not.toThrow()
  })

  it('produces a schema-valid result with minimal input', () => {
    const minimal: KarbonContact = { ContactKey: 'c-min' }
    expect(() => ContactSchema.parse(transformContact(minimal))).not.toThrow()
  })
})

// ── transformOrganization ─────────────────────────────────────────────────────

describe('transformOrganization', () => {
  it('maps OrganizationKey to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps FullName to both name and companyName', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.name).toBe('Acme Corp')
    expect(o.companyName).toBe('Acme Corp')
  })

  it('maps UserDefinedIdentifier to identification', () => {
    expect(transformOrganization(makeOrganization()).identification).toBe('acme-corp')
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.isCustomer).toBe(true)
    expect(o.isSupplier).toBe(false)
  })

  it('falls back to top-level EmailAddress when no BusinessCard', () => {
    const o = transformOrganization(makeOrganization({ BusinessCard: undefined }))
    expect(o.emails?.[0]).toEqual({ email: 'info@acme.com', type: 'WORK' })
  })

  it('falls back to top-level PhoneNumber when no BusinessCard', () => {
    const o = transformOrganization(makeOrganization({ BusinessCard: undefined }))
    expect(o.telephones?.[0]).toEqual({ telephone: '555-2000', type: 'WORK' })
  })

  it('maps BusinessCard email over top-level EmailAddress', () => {
    const o = transformOrganization(
      makeOrganization({
        EmailAddress: 'fallback@acme.com',
        BusinessCard: {
          EmailAddresses: ['card@acme.com'],
        },
      }),
    )
    expect(o.emails?.[0]).toEqual({ email: 'card@acme.com', type: 'WORK' })
  })

  it('falls back to top-level address fields when no BusinessCard', () => {
    const o = transformOrganization(makeOrganization({ BusinessCard: undefined }))
    expect(o.billingAddress?.address1).toBe('1 Corp Ave')
    expect(o.billingAddress?.city).toBe('Dallas')
    expect(o.billingAddress?.postalCode).toBe('75001')
  })

  it('maps BusinessCard address', () => {
    const o = transformOrganization(
      makeOrganization({
        BusinessCard: {
          Addresses: [
            {
              AddressLines: '42 Org Blvd',
              City: 'Phoenix',
              StateProvinceCounty: 'AZ',
              ZipCode: '85001',
              CountryCode: 'US',
            },
          ],
        },
      }),
    )
    expect(o.billingAddress?.address1).toBe('42 Org Blvd')
    expect(o.billingAddress?.city).toBe('Phoenix')
  })

  it('parses LastModifiedDateTime to a Date for updatedAt', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.updatedAt).toBeInstanceOf(Date)
    expect(o.updatedAt?.toISOString()).toBe('2024-03-10T08:30:00.000Z')
  })

  it('sets updatedAt to undefined when LastModifiedDateTime is absent', () => {
    const o = transformOrganization(makeOrganization({ LastModifiedDateTime: undefined }))
    expect(o.updatedAt).toBeUndefined()
  })

  it('passes the raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => ContactSchema.parse(transformOrganization(makeOrganization()))).not.toThrow()
  })

  it('produces a schema-valid result with minimal input', () => {
    const minimal: KarbonOrganization = { OrganizationKey: 'org-min' }
    expect(() => ContactSchema.parse(transformOrganization(minimal))).not.toThrow()
  })
})
