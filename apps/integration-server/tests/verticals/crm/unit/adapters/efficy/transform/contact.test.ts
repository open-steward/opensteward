/**
 * Fixture: the `example` values of `Contact_GET` in
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (response of GET /api/v1/contacts and GET /api/v1/contacts/{id}).
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
  type RawEfficyContact,
} from '../../../../../../../src/verticals/crm/adapters/efficy/transform/contact'

const CONTACT_EXAMPLE: RawEfficyContact = {
  external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
  crm_id: '00010QH200001PKZ',
  address_building: 'The House',
  address_country: 'US',
  address_district: 'First District ',
  address_house_number: '24',
  address_name: 'Some Village',
  address_postcode: '9999',
  address_road: 'Rue road',
  address_state: 'Florida',
  company: {
    external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
    crm_id: '00010QH200001PKY',
    name: 'Org Corporation',
  },
  created_by: 'JODOE',
  creation_date: '2024-11-14T13:31:40.033Z',
  description: 'This is an important contact',
  first_name: 'John',
  invoiceable: true,
  job_department: 'Human Resources',
  job_function: 'Employee',
  job_title: 'Manager',
  language: 'EN',
  last_name: 'Doe',
  last_update_date: '2024-11-18T13:31:40.033Z',
  last_updated_by: 'JODOE',
  linkedin_url: 'https://www.lindedin.com/johndoe',
  mail_address: 'johndoe@maxo.com',
  mobile_phone: '+123 123123123',
  phone: '+123 123123124',
  title: 'Mr.',
}

describe('efficy transformContact', () => {
  it('maps the documented Contact_GET fields and parses as a canonical Contact', () => {
    const c = ContactSchema.parse(transformContact(CONTACT_EXAMPLE))
    expect(c.id).toBe('00010QH200001PKZ')
    expect(c.first_name).toBe('John')
    expect(c.last_name).toBe('Doe')
    expect(c.email).toBe('johndoe@maxo.com')
    expect(c.phone).toBe('+123 123123124')
    expect(c.mobile).toBe('+123 123123123')
    expect(c.title).toBe('Manager')
    expect(c.company_id).toBe('00010QH200001PKY')
    expect(c.address).toEqual({
      line1: 'Rue road 24',
      line2: 'The House',
      region: 'Florida',
      postalCode: '9999',
      country: 'US',
    })
    expect(c.created_at).toBe('2024-11-14T13:31:40.033Z')
    expect(c.updated_at).toBe('2024-11-18T13:31:40.033Z')
    expect(c.metadata).toEqual(CONTACT_EXAMPLE)
  })

  it('leaves out what a sparse record does not carry', () => {
    const c = ContactSchema.parse(transformContact({ crm_id: '00010QH200001PKZ' }))
    expect(c.email).toBeUndefined()
    expect(c.company_id).toBeUndefined()
    expect(c.address).toBeUndefined()
  })

  it('drops a country that is not an ISO 3166 alpha-2 code', () => {
    const c = ContactSchema.parse(
      transformContact({ crm_id: 'x', address_country: 'Belgium', address_postcode: '1000' }),
    )
    expect(c.address).toEqual({ postalCode: '1000' })
  })

  it('refuses a record with no crm_id instead of inventing an id', () => {
    expect(() => transformContact({ first_name: 'John' })).toThrow(/crm_id/)
  })

  it('untransforms canonical Contact to the write body', () => {
    const out = untransformContact({
      first_name: 'Marc',
      last_name: 'Peeters',
      email: 'marc@example.be',
      company_id: '12',
    })
    expect(out.FIRSTNAME).toBe('Marc')
    expect(out.NAME).toBe('Peeters')
    expect(out.EMAIL).toBe('marc@example.be')
    expect(out.K_COMPANY).toBe(12)
  })
})
