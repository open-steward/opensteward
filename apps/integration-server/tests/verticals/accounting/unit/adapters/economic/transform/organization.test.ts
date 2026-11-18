import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import { transformOrganization, type EconomicSelf } from '../../../../../../../src/verticals/accounting/adapters/economic/transform/organization'

function makeRaw(overrides: Partial<EconomicSelf> = {}): EconomicSelf {
  return {
    agreementNumber: 123,
    companyName: 'Danish Co',
    vatNumber: 'DK12345678',
    baseCurrency: 'DKK',
    company: {
      addressLine1: 'Nørreport 1',
      addressLine2: '',
      city: 'Copenhagen',
      zip: '1165',
      country: 'DK',
      website: 'https://danish.co',
    },
    ...overrides,
  }
}

describe('economic transformOrganization', () => {
  it('maps agreementNumber to id', () => {
    expect(transformOrganization(makeRaw()).id).toBe('123')
  })
  it('handles fields gracefully', () => {
    expect(() => transformOrganization(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })
  it('maps companyName to name', () => {
    expect(transformOrganization(makeRaw()).name).toBe('Danish Co')
  })
  it('maps vatNumber to taxNumber', () => {
    expect(transformOrganization(makeRaw()).taxNumber).toBe('DK12345678')
  })
  it('maps baseCurrency to currency', () => {
    expect(transformOrganization(makeRaw()).currency).toBe('DKK')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
