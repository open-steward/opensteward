import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type CloudMeOrganization } from '../../../../../../../src/verticals/accounting/adapters/cloudme/transform/organization'

function makeRaw(overrides: Partial<CloudMeOrganization> = {}): CloudMeOrganization {
  return {
    id: 'ORG-001',
    name: 'CloudMe Demo Co.',
    email: 'info@cloudmedemo.sa',
    phone: '+966500000001',
    address: 'Olaya District, Riyadh, KSA',
    tax_id: 'VAT310123456789003',
    currency: 'SAR',
    ...overrides,
  }
}

describe('transformOrganization (cloudme)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.name).toBe('CloudMe Demo Co.')
    expect(result.legalName).toBe('CloudMe Demo Co.')
    expect(result.taxNumber).toBe('VAT310123456789003')
    expect(result.currency).toBe('SAR')
  })

  it('sets name and legalName to the same value', () => {
    const result = transformOrganization(makeRaw({ name: 'Another Corp' }))
    expect(result.name).toBe('Another Corp')
    expect(result.legalName).toBe('Another Corp')
  })

  it('maps address from address field', () => {
    const result = transformOrganization(makeRaw())
    expect(result.address).toBeDefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('omits taxNumber when tax_id is empty', () => {
    const result = transformOrganization(makeRaw({ tax_id: '' }))
    expect(result.taxNumber).toBeUndefined()
  })

  it('omits currency when currency is empty', () => {
    const result = transformOrganization(makeRaw({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('omits name when name is empty', () => {
    const result = transformOrganization(makeRaw({ name: '' }))
    expect(result.name).toBeUndefined()
    expect(result.legalName).toBeUndefined()
  })

  it('does not expose an id field (cloudme org has no id mapping)', () => {
    const result = transformOrganization(makeRaw())
    // The cloudme organization transform does not set id
    expect((result as Record<string, unknown>).id).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
