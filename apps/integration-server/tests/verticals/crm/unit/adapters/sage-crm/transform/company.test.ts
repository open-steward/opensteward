import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/sage-crm/transform/company'
import { company } from '../fixtures/documented'

describe('sage-crm transformCompany (documented Company)', () => {
  it('maps the documented Company fields and parses as a canonical Company', () => {
    const raw = company(41)
    const out = CompanySchema.parse(transformCompany(raw))
    expect(out).toEqual({
      id: '41',
      name: 'Eurolandia 41',
      phone: '353 1 555 0100',
      owner_id: '1',
      address: { line1: '9 Quay Road', city: 'Dublin' },
      created_at: '2019-08-24T14:15:22.000Z',
      updated_at: '2019-08-26T10:00:00.000Z',
      metadata: raw,
    })
  })

  it('throws without the documented required Comp_Name', () => {
    const { Comp_Name: _omit, ...raw } = company(2)
    expect(() => transformCompany(raw)).toThrow(/Comp_Name/)
  })

  it('throws without Comp_CompanyId', () => {
    const { Comp_CompanyId: _omit, ...raw } = company(2)
    expect(() => transformCompany(raw)).toThrow(/Comp_CompanyId/)
  })

  it('untransform keeps its previous (write-path) mapping', () => {
    expect(untransformCompany({ name: 'Acme' })).toEqual({ comp_name: 'Acme' })
  })
})
