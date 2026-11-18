import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type UhasibuBusiness } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/organization'

function makeRaw(overrides: Partial<UhasibuBusiness> = {}): UhasibuBusiness {
  return {
    id: 'uorg-1',
    name: 'Uhasibu Ltd',
    tax_number: 'P051234567A',
    email: 'info@uhasibu.co.ke',
    phone: '+254700000000',
    address: 'Moi Avenue',
    city: 'Nairobi',
    region: 'Nairobi',
    postal_code: '00100',
    country: 'KE',
    currency: 'KES',
    ...overrides,
  }
}

describe('uhasibu transformOrganization', () => {
  it('maps id to id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('uorg-1')
  })

  it('maps name to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Uhasibu Ltd')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('P051234567A')
  })

  it('maps currency to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('KES')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
