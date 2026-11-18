import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/weclapp/transform/company'

describe('weclapp transformCompany', () => {
  it('maps ORGANIZATION customer to canonical Company', () => {
    const raw = { id: 'O-001', company: 'Müller AG', phone: '+49800000', partyType: 'ORGANIZATION' }
    const company = transformCompany(raw)
    expect(company.id).toBe('O-001')
    expect(company.name).toBe('Müller AG')
    expect(company.phone).toBe('+49800000')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms Company to weclapp payload', () => {
    const out = untransformCompany({ name: 'Schmidt GmbH' })
    expect(out['company']).toBe('Schmidt GmbH')
    expect(out['partyType']).toBe('ORGANIZATION')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'O-001', company: 'Müller AG', phone: '+49800000', partyType: 'ORGANIZATION' }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
