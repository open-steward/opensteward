import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type HorizonErpOrganization } from '../../../../../../../src/verticals/accounting/adapters/horizonerp/transform/organization'

function makeRaw(overrides: Partial<HorizonErpOrganization> = {}): HorizonErpOrganization {
  return {
    id: 'ORG-001',
    name: 'Horizon Trading Co.',
    email: 'info@horizontrading.ae',
    phone: '+97143000000',
    address: 'Business Bay, Dubai, UAE',
    gstin: 'TRN100000000001',
    currency: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (horizonerp)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrganization(makeRaw())
    expect(result.id).toBe('ORG-001')
    expect(result.name).toBe('Horizon Trading Co.')
    expect(result.legalName).toBe('Horizon Trading Co.')
    expect(result.taxNumber).toBe('TRN100000000001')
    expect(result.currency).toBe('AED')
  })

  it('sets name and legalName to the same value', () => {
    const result = transformOrganization(makeRaw({ name: 'New Name Ltd' }))
    expect(result.name).toBe('New Name Ltd')
    expect(result.legalName).toBe('New Name Ltd')
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

  it('omits taxNumber when gstin is empty', () => {
    const result = transformOrganization(makeRaw({ gstin: '' }))
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

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
