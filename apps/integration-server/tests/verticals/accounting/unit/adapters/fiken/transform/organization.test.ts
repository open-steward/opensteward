import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type FikenOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/organization'

function makeOrganization(overrides: Partial<FikenOrganization> = {}): FikenOrganization {
  return {
    slug: 'acme-as',
    name: 'Acme AS',
    organizationNumber: '912345678',
    vatType: 'standard',
    address: {
      streetAddress: 'Karl Johans gate 1',
      city: 'Oslo',
      postCode: '0154',
      country: 'NO',
    },
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps slug to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('acme-as')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme AS')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Acme AS')
  })

  it('maps slug to organizationCode', () => {
    expect(transformOrganization(makeOrganization()).organizationCode).toBe('acme-as')
  })

  it('maps organizationNumber to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('912345678')
  })

  it('sets currency to NOK', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('NOK')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Karl Johans gate 1')
    expect(o.address?.city).toBe('Oslo')
    expect(o.address?.postalCode).toBe('0154')
    expect(o.address?.country).toBe('NO')
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when organizationNumber is empty', () => {
    expect(
      transformOrganization(makeOrganization({ organizationNumber: '' })).taxNumber,
    ).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
