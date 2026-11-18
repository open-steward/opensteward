import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/twenty/transform/company'
import { COMPANY } from '../fixtures'

describe('twenty transformCompany', () => {
  it('maps a documented Company record to a schema-valid Company', () => {
    const out = CompanySchema.parse(transformCompany(COMPANY))
    expect(out).toMatchObject({
      id: COMPANY.id,
      name: 'Linkedin',
      domain: 'https://linkedin.com',
      owner_id: COMPANY.accountOwnerId,
      created_at: COMPANY.createdAt,
      updated_at: COMPANY.updatedAt,
    })
    expect(out.metadata).toEqual(COMPANY)
  })

  it('leaves domain and owner absent when Twenty has none', () => {
    const out = CompanySchema.parse(
      transformCompany({
        ...COMPANY,
        domainName: { primaryLinkLabel: '', primaryLinkUrl: '', secondaryLinks: null },
        accountOwnerId: null,
      }),
    )
    expect(out.domain).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('refuses a record without an id', () => {
    expect(() => transformCompany({ ...COMPANY, id: undefined })).toThrow(/id/)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformCompany({ name: 'Acme', industry: 'Tech' })
    expect(result.name).toBe('Acme')
    expect(result.industryType).toBe('Tech')
  })
})
