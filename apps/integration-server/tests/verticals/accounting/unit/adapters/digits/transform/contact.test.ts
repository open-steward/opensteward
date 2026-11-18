/**
 * Fixture: a `Party` built from the spec's schema
 * (https://developer.digits.com/openapi/openapi.yaml): id is an `Identifier`
 * `{ issuer, id }`, kind is UnknownKind | Person | Business, roles are the
 * spec's role enum values. Digits publishes no example party body.
 */
import { describe, it, expect } from 'vitest'
import {
  transformParty,
  type DigitsParty,
} from '../../../../../../../src/verticals/accounting/adapters/digits/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

const PARTY: DigitsParty = {
  id: { issuer: 'digits.com', id: 'c0a8e3f2-1d2b-4e5f-9a6b-7c8d9e0f1a2b' },
  name: 'Globex Corp',
  email: 'ap@globex.example',
  kind: 'Business',
  description: 'Office supplies vendor',
  createdAt: '2025-03-01T10:00:00Z',
  updatedAt: '2025-03-02T11:00:00Z',
  roles: ['EntityVendorRole'],
}

describe('transformParty (digits)', () => {
  it('maps the documented Party fields', () => {
    const out = ContactSchema.parse(transformParty(PARTY))
    expect(out.id).toBe('c0a8e3f2-1d2b-4e5f-9a6b-7c8d9e0f1a2b')
    expect(out.name).toBe('Globex Corp')
    expect(out.companyName).toBe('Globex Corp')
    expect(out.emails).toEqual([{ email: 'ap@globex.example' }])
    expect(out.createdAt).toEqual(new Date('2025-03-01T10:00:00Z'))
    expect(out.updatedAt).toEqual(new Date('2025-03-02T11:00:00Z'))
  })

  it('vendor roles → supplier, not customer', () => {
    const out = ContactSchema.parse(transformParty(PARTY))
    expect(out.isSupplier).toBe(true)
    expect(out.isCustomer).toBe(false)
  })

  it('customer roles → customer, not supplier', () => {
    const out = ContactSchema.parse(
      transformParty({ ...PARTY, roles: ['EntityUnpaidCustomerRole'] }),
    )
    expect(out.isCustomer).toBe(true)
    expect(out.isSupplier).toBe(false)
  })

  // The spec's Party.roles enum names six vendor/supplier roles and two
  // customer roles; the List Parties `roles` filter adds "Vendors span
  // multiple accounting roles". Every one of them is pinned here.
  it.each([
    'EntityVendorRole',
    'EntitySupplierRole',
    'EntityOwedVendorRole',
    'EntityPrepaidVendorRole',
    'EntityAssetVendorRole',
    'EntityAssetSupplierRole',
  ])('%s alone → supplier', (role) => {
    const out = ContactSchema.parse(transformParty({ ...PARTY, roles: [role] }))
    expect(out.isSupplier).toBe(true)
    expect(out.isCustomer).toBe(false)
  })

  it.each(['EntityCustomerRole', 'EntityUnpaidCustomerRole'])('%s alone → customer', (role) => {
    const out = ContactSchema.parse(transformParty({ ...PARTY, roles: [role] }))
    expect(out.isCustomer).toBe(true)
    expect(out.isSupplier).toBe(false)
  })

  it.each(['EntityLenderRole', 'EntityShareholderRole', 'EntityBanksRole'])(
    'a known non-trading role (%s) is neither customer nor supplier',
    (role) => {
      const out = ContactSchema.parse(transformParty({ ...PARTY, roles: [role] }))
      expect(out.isCustomer).toBe(false)
      expect(out.isSupplier).toBe(false)
    },
  )

  it('no roles leaves both unknown ("Empty when no roles can be determined")', () => {
    const out = ContactSchema.parse(transformParty({ ...PARTY, roles: [] }))
    expect(out.isCustomer).toBeUndefined()
    expect(out.isSupplier).toBeUndefined()
  })

  it('a Person has no companyName; no email → no emails', () => {
    const out = ContactSchema.parse(transformParty({ ...PARTY, kind: 'Person', email: undefined }))
    expect(out.companyName).toBeUndefined()
    expect(out.emails).toBeUndefined()
  })

  it('throws on a party with no id.id', () => {
    expect(() => transformParty({ ...PARTY, id: { issuer: 'digits.com' } })).toThrow(/no id/)
  })
})
