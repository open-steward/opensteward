import { describe, it, expect } from 'vitest'
import {
  transformOrganization,
  type DirectoCompanyInfo,
} from '../../../../../../../src/verticals/accounting/adapters/directo/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

function makeRaw(overrides: Partial<DirectoCompanyInfo> = {}): DirectoCompanyInfo {
  return {
    code: 'SELF',
    name: 'Acme OÜ',
    regno: '12345678',
    vatregno: 'EE123456789',
    currency: 'EUR',
    address1: 'Kentmanni 4',
    address3: 'Tallinn',
    country: 'EE',
    email: 'info@acme.ee',
    ...overrides,
  }
}

describe('directo transformOrganization', () => {
  it('maps code to id', () => {
    const result = transformOrganization(makeRaw({ code: 'MY_COMPANY' }))
    expect(result.id).toBe('MY_COMPANY')
  })

  it('maps name to name and legalName', () => {
    const result = transformOrganization(makeRaw({ name: 'Test OÜ' }))
    expect(result.name).toBe('Test OÜ')
    expect(result.legalName).toBe('Test OÜ')
  })

  it('maps vatregno to taxNumber (preferred over regno)', () => {
    const result = transformOrganization(makeRaw({ vatregno: 'EE111', regno: 'R222' }))
    expect(result.taxNumber).toBe('EE111')
  })

  it('falls back to regno when vatregno absent', () => {
    const result = transformOrganization(makeRaw({ vatregno: undefined, regno: 'R222' }))
    expect(result.taxNumber).toBe('R222')
  })

  it('maps address3 to city', () => {
    const result = transformOrganization(makeRaw({ address3: 'Tartu' }))
    expect(result.address?.city).toBe('Tartu')
  })

  it('maps country', () => {
    const result = transformOrganization(makeRaw({ country: 'EE' }))
    expect(result.address?.country).toBe('EE')
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    const result = transformOrganization(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrganizationSchema.parse without throwing', () => {
    const result = transformOrganization(makeRaw())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
