import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type ZohoBooksOrganization,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/organization'

function makeOrganization(overrides: Partial<ZohoBooksOrganization> = {}): ZohoBooksOrganization {
  return {
    organization_id: 'org-001',
    name: 'Acme Corp',
    contact_name: 'John Doe',
    email: 'finance@acmecorp.com',
    currency_code: 'USD',
    currency_symbol: '$',
    org_address: '456 Business Ave, New York, NY 10001',
    website: 'https://acmecorp.com',
    tax_id: 'US-12-3456789',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps name correctly', () => {
    expect(transformOrganization(makeOrganization()).name).toBe('Acme Corp')
  })

  it('maps tax_id to taxNumber', () => {
    expect(transformOrganization(makeOrganization()).taxNumber).toBe('US-12-3456789')
  })

  it('maps currency_code to currency', () => {
    expect(transformOrganization(makeOrganization()).currency).toBe('USD')
  })

  it('maps website correctly', () => {
    expect(transformOrganization(makeOrganization()).website).toBe('https://acmecorp.com')
  })

  it('sets taxNumber to undefined when tax_id is empty', () => {
    expect(transformOrganization(makeOrganization({ tax_id: '' })).taxNumber).toBeUndefined()
  })

  it('sets website to undefined when website is empty', () => {
    expect(transformOrganization(makeOrganization({ website: '' })).website).toBeUndefined()
  })

  it('sets currency to undefined when currency_code is empty', () => {
    expect(transformOrganization(makeOrganization({ currency_code: '' })).currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
