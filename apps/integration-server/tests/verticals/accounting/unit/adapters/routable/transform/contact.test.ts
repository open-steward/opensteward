import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  type RoutableCompany,
} from '../../../../../../../src/verticals/accounting/adapters/routable/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeCompany(overrides: Partial<RoutableCompany> = {}): RoutableCompany {
  return {
    id: 'cmp_abc123',
    display_name: 'Acme Industries',
    business_name: 'Acme Industries LLC',
    type: 'business',
    email: 'accounts@acme.example',
    status: 'accepted',
    is_customer: true,
    is_vendor: false,
    registered_address: {
      street_address: '123 Main St',
      street_address2: 'Suite 400',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    contacts: [
      {
        id: 'con_001',
        email: 'jane@acme.example',
        first_name: 'Jane',
        last_name: 'Doe',
        phone_number: '+14155550100',
        default_contact_for_payable_and_receivable: true,
      },
    ],
    created_at: '2024-01-10T08:00:00Z',
    ...overrides,
  }
}

describe('transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeCompany()).id).toBe('cmp_abc123')
  })

  it('maps business_name to companyName', () => {
    expect(transformCompany(makeCompany()).companyName).toBe('Acme Industries LLC')
  })

  it('maps is_customer to isCustomer', () => {
    expect(transformCompany(makeCompany({ is_customer: true })).isCustomer).toBe(true)
    expect(transformCompany(makeCompany({ is_customer: false })).isCustomer).toBe(false)
  })

  it('maps is_vendor to isSupplier', () => {
    expect(transformCompany(makeCompany({ is_vendor: true })).isSupplier).toBe(true)
    expect(transformCompany(makeCompany({ is_vendor: false })).isSupplier).toBe(false)
  })

  it('maps status accepted to isActive=true', () => {
    expect(transformCompany(makeCompany({ status: 'accepted' })).isActive).toBe(true)
  })

  it('maps status added to isActive=true', () => {
    expect(transformCompany(makeCompany({ status: 'added' })).isActive).toBe(true)
  })

  it('maps status invited to isActive=false', () => {
    expect(transformCompany(makeCompany({ status: 'invited' })).isActive).toBe(false)
  })

  it('uses company-level email as primary email', () => {
    const result = transformCompany(makeCompany())
    expect(result.emails?.[0]?.email).toBe('accounts@acme.example')
  })

  it('falls back to default_contact email when company email is absent', () => {
    const result = transformCompany(makeCompany({ email: undefined }))
    expect(result.emails?.[0]?.email).toBe('jane@acme.example')
  })

  it('maps primary contact phone_number to telephones', () => {
    const result = transformCompany(makeCompany())
    expect(result.telephones?.[0]).toEqual({ telephone: '+14155550100', type: 'WORK' })
  })

  it('maps billing address fields', () => {
    const result = transformCompany(makeCompany())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.address2).toBe('Suite 400')
    expect(result.billingAddress?.city).toBe('San Francisco')
    expect(result.billingAddress?.region).toBe('CA')
    expect(result.billingAddress?.postalCode).toBe('94105')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('returns undefined billingAddress when registered_address is absent', () => {
    const result = transformCompany(makeCompany({ registered_address: undefined }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('maps created_at to createdAt Date', () => {
    expect(transformCompany(makeCompany()).createdAt).toEqual(new Date('2024-01-10T08:00:00Z'))
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCompany()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('passes ContactSchema.parse without throwing', () => {
    const result = transformCompany(makeCompany())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
