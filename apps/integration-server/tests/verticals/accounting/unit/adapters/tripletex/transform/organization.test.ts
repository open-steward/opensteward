import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type TripletexCompany,
} from '../../../../../../../src/verticals/accounting/adapters/tripletex/transform/organization'

function makeCompany(overrides: Partial<TripletexCompany> = {}): TripletexCompany {
  return {
    id: 1,
    name: 'Fjord Tech AS',
    organizationNumber: '987654321',
    address: {
      addressLine1: 'Storgata 1',
      addressLine2: 'c/o Finance Dept',
      city: 'Oslo',
      postalCode: '0150',
      country: { id: 'NO' },
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name correctly', () => {
    expect(transformOrganization(makeCompany()).name).toBe('Fjord Tech AS')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformOrganization(makeCompany()).taxNumber).toBe('987654321')
  })

  it('maps address line 1 correctly', () => {
    expect(transformOrganization(makeCompany()).address?.address1).toBe('Storgata 1')
  })

  it('maps address line 2 correctly', () => {
    expect(transformOrganization(makeCompany()).address?.address2).toBe('c/o Finance Dept')
  })

  it('maps city correctly', () => {
    expect(transformOrganization(makeCompany()).address?.city).toBe('Oslo')
  })

  it('maps postalCode correctly', () => {
    expect(transformOrganization(makeCompany()).address?.postalCode).toBe('0150')
  })

  it('maps country id to address country', () => {
    expect(transformOrganization(makeCompany()).address?.country).toBe('NO')
  })

  it('sets address to undefined when absent', () => {
    expect(transformOrganization(makeCompany({ address: undefined })).address).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
