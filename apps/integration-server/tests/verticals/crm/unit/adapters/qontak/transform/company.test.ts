import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { transformCompany } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/company'
import { companiesList } from '../fixtures'

const doc = companiesList.response[0]

describe('qontak transformCompany (documented GET /qontak/crm/companies example)', () => {
  it('maps the documented fields and satisfies CompanySchema', () => {
    const c = CompanySchema.parse(transformCompany(doc))
    expect(c.id).toBe('1')
    expect(c.name).toBe('contact company')
    // every text field in the example is "" — none become empty strings
    expect(c.phone).toBeUndefined()
    expect(c.address).toBeUndefined()
    expect(c.industry).toBeUndefined()
    expect(c.size).toBeUndefined()
    expect(c.created_at).toBe('2024-09-18T13:18:11.290Z')
    expect(c.updated_at).toBe('2024-10-28T20:56:15.663Z')
    expect(c.metadata).toEqual(doc)
  })

  it('maps telephone, address parts, industry_name and number_of_employees when set', () => {
    const c = CompanySchema.parse(
      transformCompany({
        ...doc,
        telephone: '0211234',
        address: 'Jl. Sudirman 1',
        city: 'Jakarta',
        province: 'DKI Jakarta',
        zipcode: '10220',
        industry_name: 'Retail',
        number_of_employees: 40,
      }),
    )
    expect(c.phone).toBe('0211234')
    expect(c.address).toEqual({
      line1: 'Jl. Sudirman 1',
      city: 'Jakarta',
      region: 'DKI Jakarta',
      postalCode: '10220',
    })
    expect(c.industry).toBe('Retail')
    expect(c.size).toBe(40)
  })

  it('throws on a record with no name', () => {
    expect(() => transformCompany({ ...doc, name: '' })).toThrow(/name/)
  })
})
