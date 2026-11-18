import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type LogoOrganization } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/organization'

function makeOrg(overrides: Partial<LogoOrganization> = {}): LogoOrganization {
  return {
    id: '1',
    CompanyName: 'Logo Örnek Şirketi A.Ş.',
    TaxId: '1234567890',
    Address: 'Gebze Organize Sanayi Bölgesi',
    Phone: '+90-262-123-4567',
    Email: 'info@ornek.com.tr',
    ...overrides,
  }
}

describe('transformOrganization (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformOrganization(makeOrg()).id).toBe('1')
  })

  it('maps name and legalName from CompanyName', () => {
    const o = transformOrganization(makeOrg())
    expect(o.name).toBe('Logo Örnek Şirketi A.Ş.')
    expect(o.legalName).toBe('Logo Örnek Şirketi A.Ş.')
  })

  it('maps taxNumber from TaxId', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('1234567890')
  })

  it('maps address', () => {
    const o = transformOrganization(makeOrg())
    expect(o.address?.address1).toBe('Gebze Organize Sanayi Bölgesi')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: LogoOrganization = { id: '99' }
    const o = transformOrganization(raw)
    expect(o.id).toBe('99')
    expect(o.name).toBeUndefined()
    expect(o.taxNumber).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
