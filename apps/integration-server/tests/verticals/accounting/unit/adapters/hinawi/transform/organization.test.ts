import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type HinawiCompany } from '../../../../../../../src/verticals/accounting/adapters/hinawi/transform/organization'

function makeRaw(overrides: Partial<HinawiCompany> = {}): HinawiCompany {
  return {
    id: '1',
    Name: 'Hinawi Holdings',
    Email: 'info@hinawi.ae',
    Phone: '+97141234567',
    Address: '123 DIFC, Dubai',
    TaxId: 'TRN123456789',
    Currency: 'AED',
    ...overrides,
  }
}

describe('transformOrganization (hinawi)', () => {
  it('maps core fields', () => {
    const r = transformOrganization(makeRaw())
    expect(r.name).toBe('Hinawi Holdings')
    expect(r.currency).toBe('AED')
    expect(r.taxNumber).toBe('TRN123456789')
  })

  it('passes metadata unchanged', () => { const raw = makeRaw(); expect(transformOrganization(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
