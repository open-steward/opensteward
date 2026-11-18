import { describe, it, expect } from 'vitest'
import {
  transformParty,
  type MybillbookParty,
} from '../../../../../../../src/verticals/accounting/adapters/mybillbook/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<MybillbookParty> = {}): MybillbookParty {
  return {
    id: 'party-001',
    name: 'Acme Pvt Ltd',
    party_type: 'customer',
    gstin: '27AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    email: 'acme@example.com',
    phone: '+91-9876543210',
    address: '42 MG Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'IN',
    is_active: true,
    created_at: '2024-01-10T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformParty (mybillbook)', () => {
  it('maps id', () => {
    expect(transformParty(makeRaw()).id).toBe('party-001')
  })

  it('maps name', () => {
    expect(transformParty(makeRaw()).name).toBe('Acme Pvt Ltd')
  })

  it('maps gstin to taxNumber', () => {
    expect(transformParty(makeRaw()).taxNumber).toBe('27AAAAA0000A1Z5')
  })

  it('maps pan to identification', () => {
    expect(transformParty(makeRaw()).identification).toBe('AAAAA0000A')
  })

  it('sets isCustomer=true for party_type customer', () => {
    expect(transformParty(makeRaw({ party_type: 'customer' })).isCustomer).toBe(true)
    expect(transformParty(makeRaw({ party_type: 'customer' })).isSupplier).toBe(false)
  })

  it('sets isSupplier=true for party_type supplier', () => {
    expect(transformParty(makeRaw({ party_type: 'supplier' })).isSupplier).toBe(true)
    expect(transformParty(makeRaw({ party_type: 'supplier' })).isCustomer).toBe(false)
  })

  it('sets both flags for party_type both', () => {
    const c = transformParty(makeRaw({ party_type: 'both' }))
    expect(c.isCustomer).toBe(true)
    expect(c.isSupplier).toBe(true)
  })

  it('maps is_active', () => {
    expect(transformParty(makeRaw({ is_active: true })).isActive).toBe(true)
    expect(transformParty(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('maps email to WORK email', () => {
    expect(transformParty(makeRaw()).emails![0].email).toBe('acme@example.com')
  })

  it('maps phone to WORK telephone', () => {
    expect(transformParty(makeRaw()).telephones![0].telephone).toBe('+91-9876543210')
  })

  it('maps billingAddress city', () => {
    expect(transformParty(makeRaw()).billingAddress?.city).toBe('Mumbai')
  })

  it('passes ContactSchema.parse without throwing', () => {
    expect(() => ContactSchema.parse(transformParty(makeRaw()))).not.toThrow()
  })
})
