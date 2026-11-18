/**
 * Fixture: the `example` values of `Company_GET` in
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (response of GET /api/v1/companies and GET /api/v1/companies/{id}).
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawEfficyCompany,
} from '../../../../../../../src/verticals/crm/adapters/efficy/transform/company'

const COMPANY_EXAMPLE: RawEfficyCompany = {
  external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
  crm_id: '00010QH200001PKZ',
  account_manager: { crm_id: '00010QH200001PKA', code: 'JODOE', name: 'John Doe' },
  created_by: 'JODOE',
  creation_date: '2024-11-14T13:31:40.033Z',
  employee_count: '11 - 50',
  facebook: 'https://www.facebook.com/orgcorporation',
  last_update_date: '2024-11-18T13:31:40.033Z',
  last_updated_by: 'JODOE',
  linkedin: 'https://www.lindedin.com/orgcorporation',
  memo: 'This is an important Company',
  name: 'Org Corporation',
  parent_company: {
    external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
    crm_id: '00010QH200001PKB',
    name: 'Org Corporation',
  },
  phone: '+123 123123123',
  sector: 'C- Manufacturing',
  twitter: 'https://www.twitter.com/orgcorporation',
  type: 'Prospect',
  website: 'www.orgcorporation.com',
}

describe('efficy transformCompany', () => {
  it('maps the documented Company_GET fields and parses as a canonical Company', () => {
    const c = CompanySchema.parse(transformCompany(COMPANY_EXAMPLE))
    expect(c.id).toBe('00010QH200001PKZ')
    expect(c.name).toBe('Org Corporation')
    expect(c.phone).toBe('+123 123123123')
    expect(c.industry).toBe('C- Manufacturing')
    expect(c.owner_id).toBe('00010QH200001PKA')
    expect(c.created_at).toBe('2024-11-14T13:31:40.033Z')
    expect(c.updated_at).toBe('2024-11-18T13:31:40.033Z')
    // employee_count is a band ("11 - 50"), not a headcount.
    expect(c.size).toBeUndefined()
    expect(c.metadata).toEqual(COMPANY_EXAMPLE)
  })

  it('refuses a record with no crm_id or no name instead of inventing them', () => {
    expect(() => transformCompany({ name: 'Org' })).toThrow(/crm_id/)
    expect(() => transformCompany({ crm_id: 'x' })).toThrow(/name/)
  })

  it('untransforms back to the write body', () => {
    const result = untransformCompany({ name: 'Test Corp' })
    expect(result.NAME).toBe('Test Corp')
  })
})
