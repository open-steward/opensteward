import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/company'

describe('teamleader transformCompany', () => {
  it('maps company to canonical Company', () => {
    const raw = { id: 'co-001', name: 'Janssen NV', telephones: [{ number: '+3211000000' }] }
    const company = transformCompany(raw)
    expect(company.id).toBe('co-001')
    expect(company.name).toBe('Janssen NV')
    expect(company.phone).toBe('+3211000000')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms company data', () => {
    const out = untransformCompany({ name: 'Test Co', phone: '+3212345678' })
    expect(out.name).toBe('Test Co')
    expect((out.telephones as Array<{number: string}>)[0].number).toBe('+3212345678')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'co-001', name: 'Janssen NV', telephones: [{ number: '+3211000000' }] }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
