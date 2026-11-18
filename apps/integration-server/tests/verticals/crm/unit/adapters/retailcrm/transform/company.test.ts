import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany, untransformCompany } from '../../../../../../../src/verticals/crm/adapters/retailcrm/transform/company'

describe('retailcrm transformCompany', () => {
  it('maps raw company to canonical Company', () => {
    const raw = { id: 5, name: 'ООО Ромашка', phones: [{ number: '+74951234567' }] }
    const company = transformCompany(raw)
    expect(company.id).toBe('5')
    expect(company.name).toBe('ООО Ромашка')
    expect(company.phone).toBe('+74951234567')
    expect(company.metadata).toBe(raw)
  })

  it('untransforms Company to retailcrm payload', () => {
    const out = untransformCompany({ name: 'АО Тест' })
    expect(out['name']).toBe('АО Тест')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 5, name: 'ООО Ромашка', phones: [{ number: '+74951234567' }] }
    const result = transformCompany(raw)
    expect(() => CompanySchema.parse(result)).not.toThrow()
  })
})
