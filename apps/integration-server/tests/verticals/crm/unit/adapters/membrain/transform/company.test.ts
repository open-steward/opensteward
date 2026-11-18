import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/membrain/transform/company'
import { DOC_COMPANY } from '../fixtures/docs'

describe('membrain transformCompany', () => {
  it('maps the documented GET /companies/ example', () => {
    const out = CompanySchema.parse(transformCompany(DOC_COMPANY))
    expect(out).toMatchObject({
      id: '24044e67-2158-4c1e-81be-9233239dd543',
      name: 'Socks Are Us',
      phone: '+46-8+5551234',
      owner_id: 'e30a2d31-20c7-40a7-a097-909f652aae0b',
    })
    expect(out.metadata).toEqual(DOC_COMPANY)
  })

  it('reads the all-zero SalesPersonId as no owner', () => {
    const out = transformCompany({
      ...DOC_COMPANY,
      SalesPersonId: '00000000-0000-0000-0000-000000000000',
    })
    expect(out.owner_id).toBeUndefined()
  })

  it('refuses a record with no Name instead of inventing one', () => {
    expect(() => transformCompany({ ...DOC_COMPANY, Name: '' })).toThrow(/no Name/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Test Corp', owner_id: 'u1' })
    expect(result.name).toBe('Test Corp')
    expect((result.owner as { id: string }).id).toBe('u1')
  })
})
