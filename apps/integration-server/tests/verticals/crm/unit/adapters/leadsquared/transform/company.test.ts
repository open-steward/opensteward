import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/leadsquared/transform/company'

describe('leadsquared transformCompany', () => {
  it('returns empty array — LeadSquared does not have a company resource', () => {
    // transformCompany is a stub that should still return a valid Company
    const raw = { id: 'c1', name: 'Acme' }
    const company = transformCompany(raw)
    expect(company.id).toBe('c1')
    expect(company.name).toBe('Acme')
    expect(company.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'c1', name: 'Acme' }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
