import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  transformContactV2,
  untransformContact,
  type RawPipedriveContact,
  type RawPipedriveV2Person,
} from '../../../../../../../src/verticals/crm/adapters/pipedrive/transform/contact'

const raw: RawPipedriveContact = {
  id: 42,
  first_name: 'Jane',
  last_name: 'Doe',
  name: 'Jane Doe',
  email: [{ value: 'jane@example.com', primary: true }],
  phone: [{ value: '+1-555-0100', primary: true }],
  org_id: { value: 7, name: 'Acme Corp' },
  owner_id: { id: 1, name: 'Rep' },
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-06-01T00:00:00Z',
}

describe('transformContact', () => {
  it('maps id to string', () => {
    expect(transformContact(raw).id).toBe('42')
  })

  it('maps primary email', () => {
    expect(transformContact(raw).email).toBe('jane@example.com')
  })

  it('maps primary phone', () => {
    expect(transformContact(raw).phone).toBe('+1-555-0100')
  })

  it('maps org_id to company_id', () => {
    expect(transformContact(raw).company_id).toBe('7')
  })

  it('maps owner_id', () => {
    expect(transformContact(raw).owner_id).toBe('1')
  })

  it('puts raw object in metadata', () => {
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('untransformContact', () => {
  it('maps email to array', () => {
    const out = untransformContact({ email: 'test@example.com' })
    expect(out.email).toEqual([{ value: 'test@example.com', primary: true }])
  })

  it('maps company_id to numeric org_id', () => {
    const out = untransformContact({ company_id: '7' })
    expect(out.org_id).toBe(7)
  })

  it('omits undefined fields', () => {
    const out = untransformContact({ first_name: 'Jane' })
    expect(out.org_id).toBeUndefined()
    expect(out.first_name).toBe('Jane')
  })
})

/**
 * The documented example item of GET /api/v2/persons (getPersons,
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml), verbatim.
 */
const v2Example: RawPipedriveV2Person = {
  id: 1,
  name: 'Person Name',
  first_name: 'Person',
  last_name: 'Name',
  owner_id: 1,
  org_id: 1,
  add_time: '2021-01-01T00:00:00Z',
  update_time: '2021-01-01T00:00:00Z',
  emails: [
    { value: 'email1@email.com', primary: true, label: 'work' },
    { value: 'email2@email.com', primary: false, label: 'home' },
  ],
  phones: [
    { value: '12345', primary: true, label: 'work' },
    { value: '54321', primary: false, label: 'home' },
  ],
  is_deleted: false,
  visible_to: 7,
  label_ids: [1, 2, 3],
  picture_id: 1,
  custom_fields: {},
  notes: 'Notes from contact sync',
  im: [
    { value: 'skypeusername', primary: true, label: 'skype' },
    { value: 'whatsappusername', primary: false, label: 'whatsapp' },
  ],
  birthday: '2000-12-31',
  job_title: 'Manager',
  postal_address: {
    value: '123 Main St',
    country: 'USA',
    admin_area_level_1: 'CA',
    admin_area_level_2: 'Santa Clara',
    locality: 'Sunnyvale',
    sublocality: 'Downtown',
    route: 'Main St',
    street_number: '123',
    subpremise: 'Apt 1',
    postal_code: '94085',
  },
}

describe('transformContactV2 (GET /api/v2/persons)', () => {
  it('maps the documented example and satisfies ContactSchema', () => {
    const out = ContactSchema.parse(transformContactV2(v2Example))
    expect(out).toMatchObject({
      id: '1',
      name: 'Person Name',
      first_name: 'Person',
      last_name: 'Name',
      email: 'email1@email.com',
      phone: '12345',
      title: 'Manager',
      company_id: '1',
      owner_id: '1',
      address: { city: 'Sunnyvale', region: 'CA', postalCode: '94085' },
      created_at: '2021-01-01T00:00:00.000Z',
      updated_at: '2021-01-01T00:00:00.000Z',
    })
    expect(out.metadata).toEqual(v2Example)
  })

  it('reads integer org_id/owner_id (v2 drops the nested v1 objects)', () => {
    const out = transformContactV2({ id: 2, org_id: 77, owner_id: 9 })
    expect(out.company_id).toBe('77')
    expect(out.owner_id).toBe('9')
  })

  it('takes the primary email even when it is not first', () => {
    const out = transformContactV2({
      id: 3,
      emails: [
        { value: 'second@example.com', primary: false },
        { value: 'first@example.com', primary: true },
      ],
    })
    expect(out.email).toBe('first@example.com')
  })

  it('leaves out the free-text country, which is not ISO 3166 ("USA")', () => {
    expect(transformContactV2(v2Example).address).not.toHaveProperty('country')
  })

  it('omits address, org and nullable update_time when absent', () => {
    const out = ContactSchema.parse(
      transformContactV2({
        id: 4,
        name: 'X',
        org_id: null,
        update_time: null,
        postal_address: null,
      }),
    )
    expect(out.company_id).toBeUndefined()
    expect(out.updated_at).toBeUndefined()
    expect(out.address).toBeUndefined()
  })
})
