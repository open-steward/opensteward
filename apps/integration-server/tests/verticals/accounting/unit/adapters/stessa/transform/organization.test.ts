import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type StessaOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/stessa/transform/organization'

function makeOrganization(overrides: Partial<StessaOrganization> = {}): StessaOrganization {
  return {
    id: 'org-001',
    name: 'Stessa Properties',
    legalName: 'Stessa Properties LLC',
    taxNumber: '98-7654321',
    currency: 'USD',
    website: 'https://stessaproperties.com',
    address: '500 Congress Ave',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Stessa Properties')
  })

  it('maps legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Stessa Properties LLC')
  })

  it('maps taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('98-7654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://stessaproperties.com')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('500 Congress Ave')
    expect(o.address?.city).toBe('Austin')
    expect(o.address?.region).toBe('TX')
    expect(o.address?.postalCode).toBe('78701')
    expect(o.address?.country).toBe('US')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when taxNumber is empty', () => {
    expect(transformOrganization(makeOrganization({ taxNumber: '' })).taxNumber).toBeUndefined()
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
