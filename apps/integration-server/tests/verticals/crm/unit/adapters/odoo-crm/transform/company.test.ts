/** Fixtures follow Odoo's documented read format; see contact.test.ts. */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawOdooCompany,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/company'

const COMPANY: RawOdooCompany = {
  id: 14,
  name: 'Acme Industries',
  website: 'https://www.acme.example/about',
  phone: '+32 2 555 00 00',
  industry_id: [5, 'Manufacturing'],
  user_id: [2, 'Mitchell Admin'],
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-02-01 14:20:00',
}

describe('odoo-crm transformCompany', () => {
  it('maps a documented res.partner company row onto the canonical company', () => {
    const out = CompanySchema.parse(transformCompany(COMPANY))
    expect(out).toMatchObject({
      id: '14',
      name: 'Acme Industries',
      domain: 'www.acme.example',
      phone: '+32 2 555 00 00',
      industry: 'Manufacturing',
      owner_id: '2',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(out.metadata).toEqual(COMPANY)
  })

  it('reads false as absent', () => {
    const out = CompanySchema.parse(
      transformCompany({
        id: 1,
        name: 'A',
        website: false,
        phone: false,
        industry_id: false,
        user_id: false,
      }),
    )
    expect(out.domain).toBeUndefined()
    expect(out.industry).toBeUndefined()
    expect(out.owner_id).toBeUndefined()
  })

  it('throws rather than inventing a name', () => {
    expect(() => transformCompany({ id: 1, name: false })).toThrow(/no name/)
  })
})

describe('odoo-crm untransformCompany', () => {
  it('always sets is_company to true', () => {
    expect(untransformCompany({ name: 'X' }).is_company).toBe(true)
  })
})
