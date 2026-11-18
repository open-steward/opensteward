import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/agendor/transform/company'

describe('agendor transformCompany', () => {
  it('maps raw organization to canonical Company', () => {
    const raw = {
      id: 10,
      name: 'ACME Corp',
      email: 'contact@acme.com',
      phone: '+5511000000000',
      website: 'https://acme.com',
      owner: { id: 3 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const company = transformCompany(raw)
    expect(company.id).toBe('10')
    expect(company.name).toBe('ACME Corp')
    expect(company.phone).toBe('+5511000000000')
    expect(company.domain).toBe('https://acme.com')
    expect(company.owner_id).toBe('3')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms Company to agendor payload', () => {
    const out = untransformCompany({ name: 'Empresa X', phone: '+5511111111111', domain: 'https://empresa.com' })
    expect(out['name']).toBe('Empresa X')
    expect(out['phone']).toBe('+5511111111111')
    expect(out['website']).toBe('https://empresa.com')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 10,
      name: 'ACME Corp',
      email: 'contact@acme.com',
      phone: '+5511000000000',
      website: 'https://acme.com',
      owner: { id: 3 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
