import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type KashooOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/kashoo/transform/organization'

function makeOrganization(overrides: Partial<KashooOrganization> = {}): KashooOrganization {
  return {
    id: 'org-001',
    name: 'Kashoo Inc',
    legal_name: 'Kashoo Incorporated',
    tax_number: '98-7654321',
    currency: 'CAD',
    website: 'https://kashoo.com',
    address: '100 West Pender St',
    city: 'Vancouver',
    state: 'BC',
    zip: 'V6B 1R8',
    country: 'CA',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id from raw id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('org-001')
  })

  it('maps name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Kashoo Inc')
  })

  it('maps legal_name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Kashoo Incorporated')
  })

  it('maps tax_number to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('98-7654321')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('CAD')
  })

  it('maps website', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://kashoo.com')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('100 West Pender St')
    expect(o.address?.city).toBe('Vancouver')
    expect(o.address?.region).toBe('BC')
    expect(o.address?.postalCode).toBe('V6B 1R8')
    expect(o.address?.country).toBe('CA')
  })

  it('returns undefined website when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('returns undefined name when name is empty', () => {
    expect(transformOrganization(makeOrganization({ name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when tax_number is empty', () => {
    expect(transformOrganization(makeOrganization({ tax_number: '' })).taxNumber).toBeUndefined()
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
