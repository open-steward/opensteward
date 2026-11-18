import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawTeamworkCompany,
} from '../../../../../../../src/verticals/crm/adapters/teamwork-crm/transform/company'
import { COMPANY } from '../fixtures'

describe('teamwork-crm transformCompany', () => {
  it('maps the documented Company model to a canonical Company', () => {
    const raw = { ...COMPANY } as RawTeamworkCompany
    const company = CompanySchema.parse(transformCompany(raw))
    expect(company).toMatchObject({
      id: '55',
      name: 'Acme Industries',
      domain: 'www.acme.example',
      phone: '21 432 1001',
      owner_id: '7',
      address: { line1: '1 Albert Quay', city: 'Cork', postalCode: 'T12 X8N6' },
      created_at: '2020-03-02T09:15:00Z',
      updated_at: '2020-06-10T16:40:00Z',
    })
    expect(company.address?.line2).toBeUndefined()
    expect(company.address?.region).toBeUndefined()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('leaves domain absent when website is empty or not a URL', () => {
    expect(
      transformCompany({ ...COMPANY, website: null } as RawTeamworkCompany).domain,
    ).toBeUndefined()
    expect(
      transformCompany({ ...COMPANY, website: 'acme' } as RawTeamworkCompany).domain,
    ).toBeUndefined()
  })

  it('refuses a model without a name or integer id', () => {
    expect(() =>
      transformCompany({ ...COMPANY, name: null } as unknown as RawTeamworkCompany),
    ).toThrow(/no name/)
    expect(() =>
      transformCompany({ ...COMPANY, id: '55' } as unknown as RawTeamworkCompany),
    ).toThrow(/no integer id/)
  })

  it('untransforms back to the write body', () => {
    const result = untransformCompany({ name: 'Acme', phone: '555' })
    expect(result.name).toBe('Acme')
    expect(result.phone).toBe('555')
  })
})
