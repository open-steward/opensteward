import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/sellsy/transform/company'

describe('sellsy transformCompany', () => {
  it('maps company to canonical Company', () => {
    const raw = { id: '500', name: 'Acme SARL', phone_number: '+33123456789', website: 'https://acme.fr', owner_id: '10' }
    const company = transformCompany(raw)
    expect(company.id).toBe('500')
    expect(company.name).toBe('Acme SARL')
    expect(company.phone).toBe('+33123456789')
    expect(company.owner_id).toBe('10')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms company data', () => {
    const out = untransformCompany({ name: 'Test Co', phone: '+33999999999' })
    expect(out.name).toBe('Test Co')
    expect(out.phone_number).toBe('+33999999999')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: '500', name: 'Acme SARL', phone_number: '+33123456789', website: 'https://acme.fr', owner_id: '10' }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
