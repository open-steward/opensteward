/**
 * The fixture is the documented example company contact from
 * https://api.scoro.com/api/v2 (contacts/getRelatedObjects example response),
 * trimmed to its own fields.
 */
import { describe, it, expect } from 'vitest'
import { CompanySchema } from '../../../../../../../src/verticals/crm/schema/company'
import {
  transformCompany,
  untransformCompany,
} from '../../../../../../../src/verticals/crm/adapters/scoro/transform/company'

const DOC_COMPANY = {
  contact_id: 30,
  name: 'Tutorial OÜ',
  lastname: '',
  contact_type: 'company',
  id_code: '1287230',
  bankaccount: '22100092134',
  birthday: null,
  position: '',
  comments: '',
  sex: null,
  vatno: '98235349873',
  timezone: null,
  manager_id: 1,
  is_supplier: '',
  is_client: '1',
  modified_date: '2012-09-28 15:30:00',
  addresses: null,
  means_of_contact: null,
  tags: null,
  reference_no: '',
  custom_fields: null,
  is_deleted: null,
}

describe('scoro transformCompany', () => {
  it('maps the documented example and parses with CompanySchema', () => {
    const company = CompanySchema.parse(transformCompany(DOC_COMPANY))
    expect(company).toMatchObject({ id: '30', name: 'Tutorial OÜ', owner_id: '1' })
    // "2012-09-28 15:30:00" has no offset.
    expect(company.updated_at).toBeUndefined()
    expect(company.phone).toBeUndefined()
    expect(company.metadata).toEqual(DOC_COMPANY)
  })

  it('reads the phone from means_of_contact and an offset date', () => {
    const company = CompanySchema.parse(
      transformCompany({
        ...DOC_COMPANY,
        means_of_contact: { phone: ['5252525252'] },
        created_date: '2012-09-28T15:30:00+03:00',
      }),
    )
    expect(company.phone).toBe('5252525252')
    expect(company.created_at).toBe('2012-09-28T15:30:00+03:00')
  })

  it('throws instead of inventing a name or id', () => {
    expect(() => transformCompany({ contact_id: 1, name: '' })).toThrow(/no name/)
    expect(() => transformCompany({ name: 'Acme' })).toThrow(/no id/)
  })

  it('untransformCompany keeps its (unrebuilt) write shape', () => {
    expect(untransformCompany({ name: 'Acme', phone: '1' })).toEqual({ name: 'Acme', phone: '1' })
  })
})
