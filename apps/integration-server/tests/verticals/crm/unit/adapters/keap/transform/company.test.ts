/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawKeapCompany,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/company'

/** Documented `Company` example values. */
const DOC: RawKeapCompany = {
  id: '123',
  company_name: 'Thryv',
  website: 'https://www.thryv.com',
  phone_number: { number: '5551234567' },
  owner_id: '45',
  notes: 'Key enterprise client since 2020',
  create_time: '2024-01-10T08:00:00Z',
  update_time: '2024-03-15T10:30:00Z',
}

describe('keap transformCompany', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = CompanySchema.parse(transformCompany(DOC))
    expect(result).toMatchObject({
      id: '123',
      name: 'Thryv',
      domain: 'https://www.thryv.com',
      phone: '5551234567',
      owner_id: '45',
      created_at: '2024-01-10T08:00:00Z',
      updated_at: '2024-03-15T10:30:00Z',
    })
  })

  it('a bare record satisfies the schema', () => {
    expect(() =>
      CompanySchema.parse(transformCompany({ id: '8', company_name: 'Keap Corp' })),
    ).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformCompany(DOC).metadata).toBe(DOC)
  })
})

describe('keap untransformCompany', () => {
  it('maps name to company_name', () => {
    expect(untransformCompany({ name: 'New Corp' }).company_name).toBe('New Corp')
  })
})
