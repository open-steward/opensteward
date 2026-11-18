import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawBarantumContact,
} from '../../../../../../../src/verticals/crm/adapters/barantum/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { DOC_CONTACT } from '../fixtures/documented'

const doc = (overrides: Partial<RawBarantumContact> = {}): RawBarantumContact => ({
  ...DOC_CONTACT,
  ...overrides,
})

describe('barantum transformContact (documented Contacts row)', () => {
  it('parses against ContactSchema', () => {
    const c = ContactSchema.parse(transformContact(doc()))
    expect(c.id).toBe('555590e7-ff05-448b-a51e-324f268718e0')
    expect(c.first_name).toBe('Ryan Arjuan Rante')
    expect(c.last_name).toBeUndefined()
    expect(c.name).toBe('Ryan Arjuan Rante')
    expect(c.email).toBe('ryan.rante@outlook.com')
    expect(c.mobile).toBe('1676290916474061')
    expect(c.phone).toBeUndefined()
    expect(c.company_id).toBe('c666ec53-e1b3-4f1d-a23a-1bb0663f2281')
    expect(c.address).toBeUndefined()
    expect(c.metadata).toEqual(DOC_CONTACT)
  })

  it('joins first and last name, and maps work phone, title and address', () => {
    const c = ContactSchema.parse(
      transformContact(
        doc({
          contacts_last_name: 'Rante',
          contacts_phone_work: '62211234567',
          contacts_title: 'Manager',
          contacts_address_street: 'Jl. Sudirman',
          contacts_address_city: 'Jakarta',
        }),
      ),
    )
    expect(c.name).toBe('Ryan Arjuan Rante Rante')
    expect(c.phone).toBe('62211234567')
    expect(c.title).toBe('Manager')
    expect(c.address).toEqual({
      line1: 'Jl. Sudirman',
      city: 'Jakarta',
      region: undefined,
      postalCode: undefined,
    })
  })

  it('maps contacts_address_state and contacts_address_postalcode', () => {
    const c = ContactSchema.parse(
      transformContact(
        doc({ contacts_address_state: 'DKI Jakarta', contacts_address_postalcode: '10220' }),
      ),
    )
    expect(c.address).toEqual({
      line1: undefined,
      city: undefined,
      region: 'DKI Jakarta',
      postalCode: '10220',
    })
  })

  it('does not turn the zone-less date_created / date_modified into instants', () => {
    const c = transformContact(doc())
    expect(c.created_at).toBeUndefined()
    expect(c.updated_at).toBeUndefined()
  })

  it('does not treat the owner name as an owner id', () => {
    expect(transformContact(doc()).owner_id).toBeUndefined()
  })

  it('throws on a row with no contacts_uuid', () => {
    expect(() => transformContact(doc({ contacts_uuid: '' }))).toThrow(/contacts_uuid/)
  })
})

describe('barantum untransformContact', () => {
  it('maps first_name back', () => {
    expect(untransformContact({ first_name: 'Budi' }).first_name).toBe('Budi')
  })

  it('maps last_name back', () => {
    expect(untransformContact({ last_name: 'Santoso' }).last_name).toBe('Santoso')
  })

  it('maps email back', () => {
    expect(untransformContact({ email: 'budi@example.com' }).email).toBe('budi@example.com')
  })

  it('maps phone back', () => {
    expect(untransformContact({ phone: '+62211234567' }).phone).toBe('+62211234567')
  })

  it('maps title back to job_title', () => {
    expect(untransformContact({ title: 'Sales Manager' }).job_title).toBe('Sales Manager')
  })
})
