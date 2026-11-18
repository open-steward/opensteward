import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/holded/transform/company'

describe('holded transformCompany', () => {
  it('maps raw company to canonical Company', () => {
    const raw = { id: 'comp-1', name: 'Empresa SL', phone: '+34911000000', tags: ['partner'] }
    const company = transformCompany(raw)
    expect(company.id).toBe('comp-1')
    expect(company.name).toBe('Empresa SL')
    expect(company.phone).toBe('+34911000000')
    expect(company.tags).toEqual(['partner'])
    expect(company.metadata).toBe(raw)
  })

  it('untransforms Company to holded payload', () => {
    const out = untransformCompany({ name: 'Empresa SA' })
    expect(out['name']).toBe('Empresa SA')
    expect(out['type']).toBe('company')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'comp-1', name: 'Empresa SL', phone: '+34911000000', tags: ['partner'] }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
