import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type BuiltAfricaBusiness,
} from '../../../../../../../src/verticals/accounting/adapters/built-africa/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeOrganization(overrides: Partial<BuiltAfricaBusiness> = {}): BuiltAfricaBusiness {
  return {
    id: 1,
    name: 'Acme Africa Ltd',
    email: 'info@acme.africa',
    phone_number: '+254-700-000001',
    address: '1 Westlands Rd',
    location: 'Nairobi',
    active: true,
    currency: { id: 3, short_code: 'KES' },
    country: { id: 113, name: 'Kenya', iso_code: 'KE' },
    created_at: '2024-01-15T09:30:00Z',
    updated_at: '2024-02-01T14:20:00Z',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id to string', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('1')
  })

  it('returns undefined id when id is absent', () => {
    expect(transformOrganization(makeOrganization({ id: undefined })).id).toBeUndefined()
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Africa Ltd')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme Africa Ltd')
  })

  it('maps currency.short_code to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('KES')
  })

  it('returns undefined currency when currency is absent', () => {
    expect(
      transformOrganization(makeOrganization({ currency: undefined })).currency,
    ).toBeUndefined()
  })

  it('maps address to billingAddress.address1', () => {
    expect(transformOrganization(makeOrganization()).address?.address1).toBe('1 Westlands Rd')
  })

  it('falls back to location when address is absent', () => {
    const result = transformOrganization(makeOrganization({ address: undefined }))
    expect(result.address?.address1).toBe('Nairobi')
  })

  it('maps country.iso_code to address.country', () => {
    expect(transformOrganization(makeOrganization()).address?.country).toBe('KE')
  })

  it('maps created_at to createdAt as Date', () => {
    expect(transformOrganization(makeOrganization()).createdAt).toEqual(
      new Date('2024-01-15T09:30:00Z'),
    )
  })

  it('maps updated_at to updatedAt as Date', () => {
    expect(transformOrganization(makeOrganization()).updatedAt).toEqual(
      new Date('2024-02-01T14:20:00Z'),
    )
  })

  it('returns undefined createdAt when created_at is absent', () => {
    expect(
      transformOrganization(makeOrganization({ created_at: undefined })).createdAt,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('output passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(makeOrganization()))).not.toThrow()
  })
})
