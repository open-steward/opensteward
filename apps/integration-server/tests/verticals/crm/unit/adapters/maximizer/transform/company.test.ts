import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/maximizer/transform/company'
import { documentedCompany } from '../fixtures/documented'

describe('maximizer transformCompany (Octopus AbEntry, Type Company)', () => {
  it('maps the documented AbEntry read response and parses as a Company', () => {
    const out = CompanySchema.parse(transformCompany(documentedCompany()))
    expect(out).toMatchObject({
      id: 'Q29udGFjdAkwMDEwMDIwMDA2MTMwNjM2NzExNTZDCTU=',
      name: 'ABC Wine Shop',
      phone: '123-456-7890',
      address: { line1: '1234 Main St.', city: 'Anytown', region: 'BC', postalCode: '12345' },
      created_at: '2015-01-20T20:37:51.000Z',
    })
    expect(out.domain).toBeUndefined()
  })

  it('throws when the mandatory CompanyName is missing instead of inventing one', () => {
    expect(() => transformCompany({ Key: 'k', Type: 'Company' })).toThrow(/CompanyName/)
  })

  it('keeps the raw row as metadata', () => {
    const raw = documentedCompany()
    expect(transformCompany(raw).metadata).toBe(raw)
  })

  it('untransform is unchanged (write path, out of scope)', () => {
    expect(untransformCompany({ name: 'X' })).toEqual({ CompanyName: 'X' })
  })
})
