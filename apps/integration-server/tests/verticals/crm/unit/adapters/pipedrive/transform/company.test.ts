import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  transformCompanyV2,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/company'
import type {
  RawPipedriveCompany,
  RawPipedriveV2Organization,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/company'

function makeRaw(overrides: Partial<RawPipedriveCompany> = {}): RawPipedriveCompany {
  return { id: 1, name: 'Acme', ...overrides }
}

describe('pipedrive transformCompany', () => {
  it('maps id', () => {
    expect(transformCompany(makeRaw()).id).toBe('1')
  })
  it('maps name', () => {
    expect(transformCompany(makeRaw({ name: 'Acme Corp' })).name).toBe('Acme Corp')
  })
  it('maps owner_id from nested object', () => {
    expect(transformCompany(makeRaw({ owner_id: { id: 99 } })).owner_id).toBe('99')
  })
  it('handles null owner_id', () => {
    expect(transformCompany(makeRaw({ owner_id: null })).owner_id).toBeUndefined()
  })
  it('maps address fields', () => {
    const result = transformCompany(
      makeRaw({
        address: '123 Main St',
        address_city: 'Berlin',
        address_country: 'DE',
      }),
    )
    expect(result.address?.city).toBe('Berlin')
    expect(result.address?.country).toBe('DE')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformCompany(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformCompany(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', owner_id: '5' })
    expect(result.name).toBe('Acme')
    expect(result.owner_id).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCompany(makeRaw())
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})

/**
 * The documented example item of GET /api/v2/organizations (getOrganizations,
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml), verbatim.
 */
const v2Example: RawPipedriveV2Organization = {
  id: 1,
  name: 'Organization Name',
  owner_id: 1,
  org_id: 1,
  add_time: '2021-01-01T00:00:00Z',
  update_time: '2021-01-01T00:00:00Z',
  address: {
    value: '123 Main St',
    country: 'USA',
    admin_area_level_1: 'CA',
    admin_area_level_2: 'Santa Clara',
    locality: 'Sunnyvale',
    sublocality: 'Downtown',
    route: 'Main St',
    street_number: '123',
    subpremise: '123A',
    postal_code: '94085',
  },
  is_deleted: false,
  visible_to: 7,
  label_ids: [1, 2, 3],
  website: 'https://www.company.com',
  linkedin: 'https://linkedin.com/company',
  industry: 2,
  annual_revenue: 0,
  employee_count: 10,
  custom_fields: {},
}

describe('pipedrive transformCompanyV2 (GET /api/v2/organizations)', () => {
  it('maps the documented example and satisfies CompanySchema', () => {
    const out = CompanySchema.parse(transformCompanyV2(v2Example))
    expect(out).toMatchObject({
      id: '1',
      name: 'Organization Name',
      owner_id: '1',
      size: 10,
      address: { city: 'Sunnyvale', region: 'CA', postalCode: '94085' },
      created_at: '2021-01-01T00:00:00.000Z',
      updated_at: '2021-01-01T00:00:00.000Z',
    })
    expect(out.metadata).toEqual(v2Example)
  })

  it('reads owner_id as the plain integer v2 returns', () => {
    expect(transformCompanyV2({ id: 5, name: 'A', owner_id: 42 }).owner_id).toBe('42')
  })

  it('does not map the industry id or the free-text country', () => {
    const out = transformCompanyV2(v2Example)
    expect(out.industry).toBeUndefined()
    expect(out.address).not.toHaveProperty('country')
  })

  it('omits an address with none of city, region or postal code', () => {
    expect(
      transformCompanyV2({ id: 7, name: 'C', address: { value: '1 Road', country: 'USA' } })
        .address,
    ).toBeUndefined()
  })

  it('omits address, size and update_time when null', () => {
    const out = CompanySchema.parse(
      transformCompanyV2({
        id: 6,
        name: 'B',
        address: null,
        employee_count: null,
        update_time: null,
      }),
    )
    expect(out.address).toBeUndefined()
    expect(out.size).toBeUndefined()
    expect(out.updated_at).toBeUndefined()
  })
})
