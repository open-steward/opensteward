/**
 * Vincere company → Company, over the response examples in Vincere's
 * first-party spec (https://api.vincere.io/vapi.yaml), parsed with the
 * canonical schema.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCompany,
  transformCompanySearchItem,
  untransformCompany,
  type RawVincereCompany,
  type RawVincereCompanySearchItem,
} from '../../../../../../../src/verticals/crm/adapters/vincere/transform/company'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import { DOC_COMPANY, DOC_COMPANY_SEARCH_ITEMS } from '../fixtures/documented'

const searchItems = DOC_COMPANY_SEARCH_ITEMS as unknown as RawVincereCompanySearchItem[]
const detail = DOC_COMPANY as unknown as RawVincereCompany

describe('vincere transformCompanySearchItem (GET /company/search/{matrix_vars})', () => {
  it('parses every documented example item with CompanySchema', () => {
    for (const raw of searchItems) CompanySchema.parse(transformCompanySearchItem(raw))
  })

  it('maps the documented search fields', () => {
    const c = CompanySchema.parse(transformCompanySearchItem(searchItems[1]!))
    expect(c).toMatchObject({
      id: '32368',
      name: 'TYSM corp.',
      domain: 'ww.tysmcorp.com',
      industry: 'A Industry',
      created_at: '2023-03-13T03:20:47.358Z',
      updated_at: '2023-08-24T03:44:34.334Z',
    })
    expect(c.metadata).toEqual(searchItems[1])
  })

  it('leaves out a website and industry the search did not return', () => {
    const c = CompanySchema.parse(transformCompanySearchItem(searchItems[0]!))
    expect(c.id).toBe('33275')
    expect(c.name).toBe('WHITE EMBLAME FT')
    expect(c.domain).toBeUndefined()
    expect(c.industry).toBeUndefined()
  })

  it('reads phone', () => {
    expect(transformCompanySearchItem({ id: 1, name: 'A', phone: '000' }).phone).toBe('000')
  })

  it('throws rather than inventing a name', () => {
    expect(() => transformCompanySearchItem({ id: 7 })).toThrow(/company 7 has no name/)
  })
})

describe('vincere transformCompany (GET /company/{id})', () => {
  it('parses the documented example with CompanySchema', () => {
    const c = CompanySchema.parse(transformCompany(detail))
    expect(c).toMatchObject({
      id: '1111',
      name: 'Google',
      domain: 'vincere.io',
      phone: '(+84) 93 777 7777',
      size: 0,
      created_at: '2018-04-05T00:00:00.000Z',
      updated_at: '2018-04-05T00:00:00.000Z',
    })
  })

  it('throws rather than inventing a name', () => {
    expect(() => transformCompany({ id: 11234 })).toThrow(/company 11234 has no name/)
  })
})

describe('vincere untransformCompany', () => {
  it('omits undefined fields', () => {
    expect(untransformCompany({ name: 'Acme' })).toEqual({ name: 'Acme' })
  })
})
