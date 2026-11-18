import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
  type RawSalesmateCompany,
} from '../../../../../../../src/verticals/crm/adapters/salesmate/transform/company'

/**
 * "Get a Company" publishes no example body. Built from the documented
 * company fields (Add a company body: "name": "Salesmate", "phone",
 * "website", "owner"; the add response's "id": 371) in the related-record
 * and timestamp shapes of the documented Get a Contact response.
 */
function documentedCompany(): RawSalesmateCompany {
  return {
    id: 371,
    name: 'Salesmate',
    phone: '',
    website: '',
    owner: { id: 1, name: 'Sweta Kumari' },
    currency: 'USD',
    createdAt: '2020-08-21T11:51:34.000Z',
    lastModifiedAt: '2023-07-14T07:15:38.000Z',
  }
}

describe('salesmate transformCompany', () => {
  it('maps a documented company and passes CompanySchema', () => {
    const out = CompanySchema.parse(transformCompany(documentedCompany()))
    expect(out).toMatchObject({
      id: '371',
      name: 'Salesmate',
      owner_id: '1',
      created_at: '2020-08-21T11:51:34.000Z',
      updated_at: '2023-07-14T07:15:38.000Z',
    })
    expect(out.phone).toBeUndefined()
  })

  it('maps a set phone', () => {
    expect(transformCompany({ ...documentedCompany(), phone: '704256986' }).phone).toBe('704256986')
  })

  it('throws when the required name is missing', () => {
    const raw = documentedCompany()
    delete raw.name
    expect(() => transformCompany(raw)).toThrow(/no name/)
  })

  it('throws when the id is missing', () => {
    const raw = documentedCompany()
    delete raw.id
    expect(() => transformCompany(raw)).toThrow(/no id/)
  })
})

describe('salesmate untransformCompany', () => {
  it('maps name and phone', () => {
    expect(untransformCompany({ name: 'Acme', phone: '1' })).toEqual({ name: 'Acme', phone: '1' })
  })
})
