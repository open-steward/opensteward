import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type EBoekhoudenOrg } from '../../../../../../../src/verticals/accounting/adapters/eboekhouden/transform/organization'

function makeOrg(overrides: Partial<EBoekhoudenOrg> = {}): EBoekhoudenOrg {
  return {
    companyName: 'Bedrijf BV',
    vatNumber: 'NL123456789B01',
    currency: 'EUR',
    city: 'Amsterdam',
    country: 'NL',
    ...overrides,
  }
}

describe('transformOrganization (eboekhouden)', () => {
  it('maps companyName to name', () => {
    expect(transformOrganization(makeOrg()).name).toBe('Bedrijf BV')
  })

  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeOrg()).taxNumber).toBe('NL123456789B01')
  })

  it('falls back to cocNumber when vatNumber missing', () => {
    const result = transformOrganization(makeOrg({ vatNumber: undefined, cocNumber: 'COC123' }))
    expect(result.taxNumber).toBe('COC123')
  })

  it('maps currency', () => {
    expect(transformOrganization(makeOrg({ currency: 'USD' })).currency).toBe('USD')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeOrg({ address: 'Keizersgracht 1', zipCode: '1015CX', city: 'Amsterdam', country: 'NL' }))
    expect(result.address?.address1).toBe('Keizersgracht 1')
    expect(result.address?.city).toBe('Amsterdam')
    expect(result.address?.country).toBe('NL')
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrg()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeOrg())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
