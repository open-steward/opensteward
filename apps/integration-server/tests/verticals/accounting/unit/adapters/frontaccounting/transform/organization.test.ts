import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type FACompany } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/organization'

function makeRaw(overrides: Partial<FACompany> = {}): FACompany {
  return {
    id: 1,
    name: 'Tech Solutions Ltd',
    address: '45 Business Park',
    postal_code: 'EC1A 1BB',
    city: 'London',
    country_code: 'GB',
    gst_no: 'GB123456789',
    curr_code: 'GBP',
    ...overrides,
  }
}

describe('transformOrganization (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('Tech Solutions Ltd')
    expect(result.legalName).toBe('Tech Solutions Ltd')
    expect(result.taxNumber).toBe('GB123456789')
    expect(result.currency).toBe('GBP')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address?.address1).toBe('45 Business Park')
    expect(result.address?.postalCode).toBe('EC1A 1BB')
    expect(result.address?.city).toBe('London')
    expect(result.address?.country).toBe('GB')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
