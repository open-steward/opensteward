import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type GustoOrganization } from '../../../../../../../src/verticals/accounting/adapters/gusto/transform/organization'

function makeOrganization(overrides: Partial<GustoOrganization> = {}): GustoOrganization {
  return {
    id: 'co_001',
    name: 'Acme Corp',
    ein: '12-3456789',
    phone: '555-0100',
    email: 'payroll@acme.com',
    locations: [
      {
        street_1: '100 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        country: 'US',
      },
    ],
    ...overrides,
  }
}

describe('transformOrganization (Gusto)', () => {
  it('maps name', () => {
    expect(transformOrganization(makeOrganization({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })

  it('maps legalName from name', () => {
    expect(transformOrganization(makeOrganization({ name: 'Acme Corp' })).legalName).toBe('Acme Corp')
  })

  it('maps ein to taxNumber', () => {
    expect(transformOrganization(makeOrganization({ ein: '99-9999999' })).taxNumber).toBe('99-9999999')
  })

  it('maps first location to address', () => {
    const result = transformOrganization(makeOrganization())
    expect(result.address?.address1).toBe('100 Main St')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.country).toBe('US')
  })

  it('returns no address when locations is absent', () => {
    const result = transformOrganization(makeOrganization({ locations: [] }))
    expect(result.address).toBeUndefined()
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeOrganization()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrganization({ name: 'Acme Corp' }))
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
