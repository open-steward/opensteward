import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/folk/transform/company'
import { documentedCompany } from '../fixtures/documented'

describe('folk transformCompany (documented Company)', () => {
  it('maps the documented example and satisfies the canonical schema', () => {
    const raw = documentedCompany()
    const result = CompanySchema.parse(transformCompany(raw))
    expect(result).toMatchObject({
      id: 'com_183ed5cc-3182-45de-84d1-d520f2604810',
      name: 'Tech Corp',
      industry: 'Technology',
      phone: '+1234567890',
      created_at: '2021-01-01T00:00:00.000Z',
    })
    // No documented domain field: urls are URLs, not domains.
    expect(result.domain).toBeUndefined()
    expect(result.metadata).toEqual(raw)
  })

  it('leaves optional fields absent when the documented values are empty or null', () => {
    const raw = { ...documentedCompany(), industry: '', phones: [], createdAt: null }
    const result = CompanySchema.parse(transformCompany(raw))
    expect(result.industry).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.created_at).toBeUndefined()
  })

  it('treats an empty primary phone string as absent', () => {
    const raw = { ...documentedCompany(), phones: [''] }
    expect(CompanySchema.parse(transformCompany(raw)).phone).toBeUndefined()
  })

  it('untransformCompany maps name and domain', () => {
    const result = untransformCompany({ name: 'Corp', domain: 'corp.com' })
    expect(result.name).toBe('Corp')
    expect(result.domain).toBe('corp.com')
  })
})
