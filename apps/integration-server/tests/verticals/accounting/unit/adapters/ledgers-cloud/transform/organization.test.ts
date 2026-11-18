import { describe, it, expect } from 'vitest'
import { transformOrganization } from '../../../../../../../src/verticals/accounting/adapters/ledgers-cloud/transform/organization'
import { OrganizationSchema } from '../../../../../../../src/verticals/accounting/schema/organization'

const base = {
  id: 'biz-1',
  business_name: 'Ledgers Corp',
  legal_name: 'Ledgers Corporation Ltd',
  gstin: 'GSTIN-12345',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  website: 'https://ledgers.cloud',
  address: 'MG Road',
  city: 'Bangalore',
  state: 'KA',
  pin_code: '560001',
  country: 'IN',
  created_at: '2021-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

describe('transformOrganization', () => {
  it('maps core fields', () => {
    const result = transformOrganization(base)
    expect(result.name).toBe('Ledgers Corp')
    expect(result.legalName).toBe('Ledgers Corporation Ltd')
    expect(result.currency).toBe('INR')
    expect(result.timezone).toBe('Asia/Kolkata')
    expect(result.website).toBe('https://ledgers.cloud')
  })

  it('maps gstin as taxNumber', () => {
    expect(transformOrganization(base).taxNumber).toBe('GSTIN-12345')
  })

  it('falls back to pan when gstin absent', () => {
    const result = transformOrganization({ ...base, gstin: undefined, pan: 'PAN-001' })
    expect(result.taxNumber).toBe('PAN-001')
  })

  it('maps address fields including state as region', () => {
    const result = transformOrganization(base)
    expect(result.address?.address1).toBe('MG Road')
    expect(result.address?.city).toBe('Bangalore')
    expect(result.address?.region).toBe('KA')
    expect(result.address?.postalCode).toBe('560001')
    expect(result.address?.country).toBe('IN')
  })

  it('prefers pin_code over postal_code', () => {
    const result = transformOrganization({ ...base, postal_code: '999999' })
    expect(result.address?.postalCode).toBe('560001')
  })

  it('parses dates as Date objects', () => {
    const result = transformOrganization(base)
    expect(result.createdAt).toEqual(new Date('2021-01-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => OrganizationSchema.parse(transformOrganization(base))).not.toThrow()
  })
})
