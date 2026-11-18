import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ProcountorOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/procountor/transform/organization'

function makeOrg(overrides: Partial<ProcountorOrganization> = {}): ProcountorOrganization {
  return {
    id: 1,
    name: 'Oy Testi Ab',
    businessId: '1234567-8',
    street: 'Mannerheimintie 1',
    city: 'Helsinki',
    zip: '00100',
    country: 'FI',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id as string', () => {
    expect(transformOrganization(makeOrg()).id).toBe('1')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Oy Testi Ab')
  })

  it('maps name to legalName', () => {
    expect(transformOrganization(makeOrg()).legalName).toBe('Oy Testi Ab')
  })

  it('maps businessId to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('1234567-8')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg()).currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const org = transformOrganization(makeOrg())
    expect(org.address?.address1).toBe('Mannerheimintie 1')
    expect(org.address?.city).toBe('Helsinki')
    expect(org.address?.postalCode).toBe('00100')
    expect(org.address?.country).toBe('FI')
  })

  it('returns undefined name when empty', () => {
    expect(transformOrganization(makeOrg({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when businessId is empty', () => {
    expect(transformOrganization(makeOrg({ businessId: '' })).taxNumber).toBeUndefined()
  })

  it('returns undefined currency when empty', () => {
    expect(transformOrganization(makeOrg({ currency: '' })).currency).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
