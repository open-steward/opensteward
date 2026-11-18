import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/raynet/transform/company'
import { COMPANY } from '../fixtures'

describe('raynet transformCompany (GET /company/ documented example)', () => {
  it('maps the documented fields and parses as a canonical Company', () => {
    const c = CompanySchema.parse(transformCompany(COMPANY))
    expect(c).toMatchObject({
      id: '2',
      name: 'Test s.r.o.',
      domain: 'www.test.rnt',
      phone: '123 456 789',
      industry: 'industry 1',
      owner_id: '1',
      tags: ['tag 1', 'tag 2'],
      address: {
        line1: 'Těšínská',
        city: 'Ostrava',
        region: 'Moravian-Silesian Region',
        postalCode: '710 00',
      },
      created_at: '2022-06-18T11:19:00.000Z',
      updated_at: '2022-09-22T12:17:00.000Z',
    })
    // The documented account address carries a country name, not a code.
    expect(c.address?.country).toBeUndefined()
    expect(c.metadata).toEqual(COMPANY)
  })

  it('strips a scheme and path from the WWW field', () => {
    const raw = {
      ...COMPANY,
      primaryAddress: {
        ...COMPANY.primaryAddress,
        contactInfo: { ...COMPANY.primaryAddress.contactInfo, www: 'https://acme.example/about' },
      },
    }
    expect(CompanySchema.parse(transformCompany(raw)).domain).toBe('acme.example')
  })

  it('refuses an account without its required name instead of inventing one', () => {
    expect(() => transformCompany({ ...COMPANY, name: null })).toThrow(
      expect.objectContaining({ statusCode: 502 }),
    )
  })

  it('untransforms back to platform shape', () => {
    expect(untransformCompany({ name: 'Acme' }).name).toBe('Acme')
  })
})
