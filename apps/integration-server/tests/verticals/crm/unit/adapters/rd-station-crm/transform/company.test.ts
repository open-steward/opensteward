import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/company'

describe('rd-station-crm transformCompany', () => {
  it('maps organization to canonical Company', () => {
    const raw = { _id: 'org-xyz', name: 'Empresa LTDA', phone: '+5511987654321' }
    const company = transformCompany(raw)
    expect(company.id).toBe('org-xyz')
    expect(company.name).toBe('Empresa LTDA')
    expect(company.phone).toBe('+5511987654321')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms company data', () => {
    const out = untransformCompany({ name: 'Nova Empresa SA' })
    expect(out.name).toBe('Nova Empresa SA')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { _id: 'org-xyz', name: 'Empresa LTDA', phone: '+5511987654321' }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
