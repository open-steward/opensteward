import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  untransformCompany,
  type RawVendastaCompany,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'

function makeRaw(overrides: Partial<RawVendastaCompany> = {}): RawVendastaCompany {
  return {
    crmObjectId: 'co_001',
    ownerId: 'usr_owner',
    created: '2026-01-15T09:30:00.000Z',
    updated: '2026-02-01T14:20:00.000Z',
    fields: [
      { fieldId: 'standard__company_name', stringValue: 'Acme Industries' },
      { fieldId: 'standard__company_website', stringValue: 'https://www.acme.example' },
      { fieldId: 'standard__company_phone_number', stringValue: '+14155550123' },
      { fieldId: 'standard__company_number_of_employees', floatValue: 350 },
      { fieldId: 'standard__company_tags', stringValue: 'vip,enterprise' },
      {
        fieldId: 'standard__company_primary_location_street_address_1',
        stringValue: '123 Main St',
      },
      { fieldId: 'standard__company_primary_location_city_locality', stringValue: 'San Francisco' },
      { fieldId: 'standard__company_primary_location_state_province_region', stringValue: 'CA' },
      { fieldId: 'standard__company_primary_location_country', stringValue: 'US' },
      { fieldId: 'standard__company_primary_location_zip_postal_code', stringValue: '94105' },
    ],
    ...overrides,
  }
}

describe('vendasta transformCompany', () => {
  it('maps id from crmObjectId', () => {
    expect(transformCompany(makeRaw()).id).toBe('co_001')
  })

  it('maps name from standard__company_name field', () => {
    expect(transformCompany(makeRaw()).name).toBe('Acme Industries')
  })

  it('strips www. from website to produce domain', () => {
    expect(transformCompany(makeRaw()).domain).toBe('acme.example')
  })

  it('maps phone from standard__company_phone_number field', () => {
    expect(transformCompany(makeRaw()).phone).toBe('+14155550123')
  })

  it('maps size from floatValue (rounded)', () => {
    expect(transformCompany(makeRaw()).size).toBe(350)
  })

  it('rounds fractional employee count', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__company_number_of_employees', floatValue: 349.7 }],
    })
    expect(transformCompany(raw).size).toBe(350)
  })

  it('splits comma-separated tags', () => {
    expect(transformCompany(makeRaw()).tags).toEqual(['vip', 'enterprise'])
  })

  it('maps address fields', () => {
    const address = transformCompany(makeRaw()).address
    expect(address?.line1).toBe('123 Main St')
    expect(address?.city).toBe('San Francisco')
    expect(address?.region).toBe('CA')
    expect(address?.country).toBe('US')
    expect(address?.postalCode).toBe('94105')
  })

  it('prefers raw.ownerId over system__company_owner_id field', () => {
    expect(transformCompany(makeRaw()).owner_id).toBe('usr_owner')
  })

  it('maps timestamps from raw.created and raw.updated', () => {
    const result = transformCompany(makeRaw())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => CompanySchema.parse(transformCompany(makeRaw()))).not.toThrow()
  })

  it('handles missing optional fields without throwing', () => {
    const minimal: RawVendastaCompany = { crmObjectId: 'co_min', fields: [] }
    expect(() => CompanySchema.parse(transformCompany(minimal))).not.toThrow()
  })

  it('domain is undefined when no website field', () => {
    const raw = makeRaw({ fields: [] })
    expect(transformCompany(raw).domain).toBeUndefined()
  })

  it('uses raw website string as fallback when URL parsing fails', () => {
    const raw = makeRaw({
      fields: [{ fieldId: 'standard__company_website', stringValue: 'not-a-url' }],
    })
    expect(transformCompany(raw).domain).toBe('not-a-url')
  })
})

describe('vendasta untransformCompany', () => {
  it('maps name to standard__company_name field', () => {
    const fields = untransformCompany({ name: 'Acme' })
    const found = fields.find((f) => f.fieldId === 'standard__company_name')
    expect(found?.stringValue).toBe('Acme')
  })

  it('maps size to standard__company_number_of_employees field as string', () => {
    const fields = untransformCompany({ size: 200 })
    const found = fields.find((f) => f.fieldId === 'standard__company_number_of_employees')
    expect(found?.stringValue).toBe('200')
  })

  it('joins tags with comma', () => {
    const fields = untransformCompany({ tags: ['vip', 'enterprise'] })
    const found = fields.find((f) => f.fieldId === 'standard__company_tags')
    expect(found?.stringValue).toBe('vip,enterprise')
  })
})
