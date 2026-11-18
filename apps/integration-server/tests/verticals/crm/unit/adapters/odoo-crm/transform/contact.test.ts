/**
 * Fixtures follow Odoo's documented read format: many2one fields read as
 * `[id, display_name]` and empty fields as `false` ("country_id": [ 21,
 * "Belgium" ], "comment": false in the search_read example on
 * https://www.odoo.com/documentation/17.0/developer/reference/external_api.html),
 * and Datetime fields are UTC strings in DEFAULT_SERVER_DATETIME_FORMAT
 * ("it must be UTC-only and formatted according to
 * odoo.tools.misc.DEFAULT_SERVER_DATETIME_FORMAT" — 19.0 ORM reference).
 */
import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  CONTACT_FIELDS,
  transformContact,
  untransformContact,
  type RawOdooContact,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/contact'

const PERSON: RawOdooContact = {
  id: 26,
  name: 'Jane Doe',
  email: 'jane@acme.example',
  phone: '+32 2 555 01 23',
  function: 'Head of Finance',
  commercial_partner_id: [14, 'Acme Industries'],
  user_id: [2, 'Mitchell Admin'],
  create_date: '2026-01-15 09:30:00',
  write_date: '2026-02-01 14:20:05',
}

describe('odoo-crm transformContact', () => {
  it('maps a documented res.partner row onto the canonical contact', () => {
    const out = ContactSchema.parse(transformContact(PERSON))
    expect(out).toMatchObject({
      id: '26',
      name: 'Jane Doe',
      email: 'jane@acme.example',
      phone: '+32 2 555 01 23',
      title: 'Head of Finance',
      company_id: '14',
      owner_id: '2',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:05.000Z',
    })
    expect(out.metadata).toEqual(PERSON)
  })

  it('does not invent first/last names from the display name', () => {
    const out = ContactSchema.parse(transformContact(PERSON))
    expect(out.first_name).toBeUndefined()
    expect(out.last_name).toBeUndefined()
  })

  it('a standalone person is its own commercial partner, so has no company', () => {
    const out = ContactSchema.parse(
      transformContact({ ...PERSON, commercial_partner_id: [26, 'Jane Doe'] }),
    )
    expect(out.company_id).toBeUndefined()
  })

  it('reads false as absent', () => {
    const out = ContactSchema.parse(
      transformContact({
        id: 3,
        name: 'X',
        email: false,
        phone: false,
        function: false,
        commercial_partner_id: false,
        user_id: false,
        create_date: false,
        write_date: false,
      }),
    )
    expect(out).toMatchObject({ id: '3', name: 'X' })
    for (const k of [
      'email',
      'phone',
      'title',
      'company_id',
      'owner_id',
      'created_at',
      'updated_at',
    ]) {
      expect(out[k as keyof typeof out]).toBeUndefined()
    }
  })

  it('asks only for fields res.partner declares', () => {
    expect(CONTACT_FIELDS).not.toContain('firstname')
    expect(CONTACT_FIELDS).not.toContain('lastname')
    expect(CONTACT_FIELDS).not.toContain('mobile')
  })
})

describe('odoo-crm untransformContact', () => {
  it('always sets is_company to false', () => {
    expect(untransformContact({ email: 'a@b.com' }).is_company).toBe(false)
  })

  it('builds name from first_name + last_name', () => {
    expect(untransformContact({ first_name: 'Bob', last_name: 'Brown' }).name).toBe('Bob Brown')
  })
})
