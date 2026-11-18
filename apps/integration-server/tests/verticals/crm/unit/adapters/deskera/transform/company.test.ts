import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/deskera/transform/company'

describe('deskera transformCompany', () => {
  it('maps organization to canonical Company', () => {
    const raw = { id: 'O-1', name: 'TechCorp SG', email: 'info@techcorp.sg', phone: '+6561234567', ownerId: 'u-10' }
    const company = transformCompany(raw)
    expect(company.id).toBe('O-1')
    expect(company.name).toBe('TechCorp SG')
    expect(company.phone).toBe('+6561234567')
    expect(company.owner_id).toBe('u-10')
    expect(company.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'O-1', name: 'TechCorp SG', email: 'info@techcorp.sg', phone: '+6561234567', ownerId: 'u-10' }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
