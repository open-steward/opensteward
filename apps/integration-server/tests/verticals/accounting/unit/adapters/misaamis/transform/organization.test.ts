import { describe, it, expect } from 'vitest'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'
import {
  transformOrganization,
  type MisaAmisCompany,
} from '../../../../../../../src/verticals/accounting/adapters/misaamis/transform/organization'

function makeCompany(overrides: Partial<MisaAmisCompany> = {}): MisaAmisCompany {
  return {
    id: 'misa-1',
    company_name: 'MisaAmis Ltd',
    company_code: 'MISA001',
    tax_code: 'TX-9988776',
    email: 'contact@misaamis.vn',
    phone: '+84-123456789',
    address: '10 Nguyen Hue',
    city: 'Ho Chi Minh City',
    province: 'Ho Chi Minh',
    country: 'VN',
    currency_code: 'VND',
    fiscal_year_start: '2024-01-01',
    ...overrides,
  }
}

describe('transformOrganization', () => {
  it('maps id', () => {
    const result = transformOrganization(makeCompany())
    expect(result.id).toBe('misa-1')
  })

  it('maps company_name to name and legalName', () => {
    const result = transformOrganization(makeCompany())
    expect(result.name).toBe('MisaAmis Ltd')
    expect(result.legalName).toBe('MisaAmis Ltd')
  })

  it('maps company_code to organizationCode', () => {
    const result = transformOrganization(makeCompany())
    expect(result.organizationCode).toBe('MISA001')
  })

  it('maps tax_code to taxNumber', () => {
    const result = transformOrganization(makeCompany())
    expect(result.taxNumber).toBe('TX-9988776')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrganization(makeCompany())
    expect(result.currency).toBe('VND')
  })

  it('maps address fields', () => {
    const result = transformOrganization(makeCompany())
    expect(result.address?.address1).toBe('10 Nguyen Hue')
    expect(result.address?.city).toBe('Ho Chi Minh City')
    expect(result.address?.region).toBe('Ho Chi Minh')
    expect(result.address?.country).toBe('VN')
  })

  it('passes raw object as metadata (reference equality)', () => {
    const raw = makeCompany()
    expect(transformOrganization(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrganization(makeCompany())
    expect(() => OrganizationSchema.parse(result)).not.toThrow()
  })
})
