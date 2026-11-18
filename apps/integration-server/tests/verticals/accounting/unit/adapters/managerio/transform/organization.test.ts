import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type ManagerioOrganization } from '../../../../../../../src/verticals/accounting/adapters/managerio/transform/organization'

function makeRaw(overrides: Partial<ManagerioOrganization> = {}): ManagerioOrganization {
  return {
    Key: 'org-001',
    BusinessName: 'Acme LLC',
    Email: 'info@acme.ae',
    Phone: '+97141234567',
    Address: { Line1: '123 Business Bay', City: 'Dubai', PostalCode: '00000', Country: 'AE' },
    TaxNumber: 'TRN123456789',
    BaseCurrency: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (managerio)', () => {
  it('maps core fields', () => {
    const r = transformOrganization(makeRaw())
    expect(r.id).toBe('org-001')
    expect(r.name).toBe('Acme LLC')
    expect(r.currency).toBe('AED')
    expect(r.taxNumber).toBe('TRN123456789')
  })

  it('maps address', () => {
    const r = transformOrganization(makeRaw())
    expect(r.address?.city).toBe('Dubai')
    expect(r.address?.country).toBe('AE')
  })

  it('passes metadata unchanged', () => { const raw = makeRaw(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
