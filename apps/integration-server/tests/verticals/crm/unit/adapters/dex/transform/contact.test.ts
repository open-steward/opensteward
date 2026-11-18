/**
 * Fixture fields from GET /v1/contacts/ ("data.items[].id string (uuid) required",
 * "data.items[].full_name string | null", "data.items[].job_title string | null",
 * "data.items[].contact_emails array<object>", ...) at
 * https://getdex.com/docs/api-reference/reference/v1/contacts/list-contacts.
 * Email/phone row fields are the ones the API documents for those relations
 * (contact_emails {email, label, ranking}; contact_phone_numbers {phone_number, ...}).
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  untransformContact,
  type RawDexContact,
} from '../../../../../../../src/verticals/crm/adapters/dex/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

const ID = '3f2b8c1e-5d4a-4b6f-9a1e-2c3d4e5f6a7b'

function makeRaw(overrides: Partial<RawDexContact> = {}): RawDexContact {
  return {
    id: ID,
    first_name: 'Jane',
    last_name: 'Doe',
    full_name: 'Jane Q. Doe',
    job_title: 'VP Sales',
    company: 'Acme',
    contact_emails: [{ email: 'jane@example.com', label: 'work' }],
    contact_phone_numbers: [{ phone_number: '+15550001111', label: 'mobile' }],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T12:30:00.000Z',
    ...overrides,
  }
}

describe('dex transformContact (v1)', () => {
  it('maps the documented fields and parses as a Contact', () => {
    const c = ContactSchema.parse(transformContact(makeRaw()))
    expect(c).toMatchObject({
      id: ID,
      first_name: 'Jane',
      last_name: 'Doe',
      name: 'Jane Q. Doe',
      email: 'jane@example.com',
      phone: '+15550001111',
      title: 'VP Sales',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T12:30:00.000Z',
    })
  })

  it('takes name from full_name only, never assembling one', () => {
    const c = ContactSchema.parse(transformContact(makeRaw({ full_name: null })))
    expect(c.name).toBeUndefined()
  })

  it('leaves email/phone empty when the contact has none', () => {
    const c = ContactSchema.parse(
      transformContact(makeRaw({ contact_emails: [], contact_phone_numbers: [] })),
    )
    expect(c.email).toBeUndefined()
    expect(c.phone).toBeUndefined()
  })

  it('parses the documented minimal example ({ id } only)', () => {
    const c = ContactSchema.parse(transformContact({ id: '00000000-0000-0000-0000-000000000000' }))
    expect(c.id).toBe('00000000-0000-0000-0000-000000000000')
    expect(c.created_at).toBeUndefined()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
})

describe('dex untransformContact', () => {
  it('maps email → emails array with work label', () => {
    const out = untransformContact({ email: 'jane@example.com' })
    const emails = out.emails as Array<{ email: string; label: string }>
    expect(emails[0]!.email).toBe('jane@example.com')
    expect(emails[0]!.label).toBe('work')
  })

  it('maps first_name, last_name and title', () => {
    const out = untransformContact({ first_name: 'Jane', last_name: 'Doe', title: 'VP Sales' })
    expect(out).toMatchObject({ first_name: 'Jane', last_name: 'Doe', job_title: 'VP Sales' })
  })
})
