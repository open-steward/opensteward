import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type NetvisorContact,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/contact'

function makeContact(overrides: Partial<NetvisorContact> = {}): NetvisorContact {
  return {
    NetvisorKey: 33001,
    Name: 'Oy Firma Ab',
    OrganisationIdentifier: '1234567-8',
    Email: 'info@firma.fi',
    PhoneNumber: '+358 40 1234567',
    StreetAddress: 'Mannerheimintie 1',
    City: 'Helsinki',
    PostNumber: '00100',
    Country: 'FI',
    IsActive: 1,
    CustomerGroupName: 'Customer',
    ...overrides,
  }
}

describe('transformContact', () => {
  it('maps NetvisorKey to id as string', () => {
    expect(transformContact(makeContact()).id).toBe('33001')
  })

  it('maps Name', () => {
    expect(transformContact(makeContact()).name).toBe('Oy Firma Ab')
  })

  it('maps OrganisationIdentifier to identification', () => {
    expect(transformContact(makeContact()).identification).toBe('1234567-8')
  })

  it('maps IsActive=1 to isActive=true', () => {
    expect(transformContact(makeContact({ IsActive: 1 })).isActive).toBe(true)
  })

  it('maps IsActive=0 to isActive=false', () => {
    expect(transformContact(makeContact({ IsActive: 0 })).isActive).toBe(false)
  })

  it('infers isCustomer from CustomerGroupName containing "Customer"', () => {
    expect(transformContact(makeContact({ CustomerGroupName: 'Customer' })).isCustomer).toBe(true)
  })

  it('infers isSupplier from CustomerGroupName containing "Supplier"', () => {
    const c = transformContact(makeContact({ CustomerGroupName: 'Supplier' }))
    expect(c.isSupplier).toBe(true)
  })

  it('maps Email to emails', () => {
    const c = transformContact(makeContact())
    expect(c.emails?.[0]).toEqual({ email: 'info@firma.fi', type: 'WORK' })
  })

  it('returns undefined emails when Email is empty', () => {
    expect(transformContact(makeContact({ Email: '' })).emails).toBeUndefined()
  })

  it('maps PhoneNumber to telephones', () => {
    const c = transformContact(makeContact())
    expect(c.telephones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ telephone: '+358 40 1234567', type: 'WORK' }),
      ]),
    )
  })

  it('maps billing address fields', () => {
    const c = transformContact(makeContact())
    expect(c.billingAddress?.address1).toBe('Mannerheimintie 1')
    expect(c.billingAddress?.city).toBe('Helsinki')
    expect(c.billingAddress?.postalCode).toBe('00100')
    expect(c.billingAddress?.country).toBe('FI')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformContact(makeContact({ Name: '' })).name).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
