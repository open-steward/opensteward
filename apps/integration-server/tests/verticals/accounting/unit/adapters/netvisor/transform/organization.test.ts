import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type NetvisorOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/netvisor/transform/organization'

function makeOrganization(overrides: Partial<NetvisorOrganization> = {}): NetvisorOrganization {
  return {
    CompanyId: 'company-123',
    Name: 'Oy Firma Ab',
    BusinessId: '1234567-8',
    Address: 'Mannerheimintie 1',
    City: 'Helsinki',
    PostCode: '00100',
    Country: 'FI',
    Currency: 'EUR',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps CompanyId to id', () => {
    expect(transformOrganization(makeOrganization()).id).toBe('company-123')
  })

  it('maps Name', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Oy Firma Ab')
  })

  it('maps Name to legalName', () => {
    expect(transformOrganization(makeOrganization()).legalName).toBe('Oy Firma Ab')
  })

  it('maps BusinessId to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('1234567-8')
  })

  it('maps Currency to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('EUR')
  })

  it('maps address fields', () => {
    const o = transformOrganization(makeOrganization())
    expect(o.address?.address1).toBe('Mannerheimintie 1')
    expect(o.address?.city).toBe('Helsinki')
    expect(o.address?.postalCode).toBe('00100')
    expect(o.address?.country).toBe('FI')
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformOrganization(makeOrganization({ Name: '' })).name).toBeUndefined()
  })

  it('returns undefined taxNumber when BusinessId is empty', () => {
    expect(transformOrganization(makeOrganization({ BusinessId: '' })).taxNumber).toBeUndefined()
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
