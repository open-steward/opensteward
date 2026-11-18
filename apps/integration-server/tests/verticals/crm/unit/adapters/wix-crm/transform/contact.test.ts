import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import {
  transformContact,
  untransformContact,
} from '../../../../../../../src/verticals/crm/adapters/wix-crm/transform/contact'
import type { WixContact } from '../../../../../../../src/verticals/crm/adapters/wix-crm/client'

/**
 * Built from the documented Contacts v4 `Contact` fields
 * (https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts.md):
 * id, revision, source.sourceType/appId, createdDate, updatedDate,
 * primaryInfo.email/phone, info.name.first/last, info.company, info.jobTitle.
 * The GUID is the one in the Get Contact example
 * (https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/get-contact.md).
 */
function makeRaw(overrides: Partial<WixContact> = {}): WixContact {
  return {
    id: '8046df3c-7575-4098-a5ab-c91ad8f33c47',
    revision: 3,
    source: { sourceType: 'WIX_APP', appId: 'app-guid-1' },
    createdDate: '2026-01-15T09:30:00.000Z',
    updatedDate: '2026-02-01T14:20:00.000Z',
    primaryInfo: { email: 'alice@example.com', phone: '+14155550123' },
    info: {
      name: { first: 'Alice', last: 'Liddell' },
      company: 'Wonderland Ltd',
      jobTitle: 'CEO',
    },
    ...overrides,
  }
}

describe('wix-crm transformContact', () => {
  it('maps a documented v4 contact and satisfies the schema', () => {
    const result = ContactSchema.parse(transformContact(makeRaw()))
    expect(result).toMatchObject({
      id: '8046df3c-7575-4098-a5ab-c91ad8f33c47',
      first_name: 'Alice',
      last_name: 'Liddell',
      name: 'Alice Liddell',
      email: 'alice@example.com',
      phone: '+14155550123',
      title: 'CEO',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
  })

  it('reads the name from info.name, not a top-level name', () => {
    const result = transformContact(makeRaw({ info: { name: { first: 'Bob' } } }))
    expect(result.first_name).toBe('Bob')
    expect(result.last_name).toBeUndefined()
    expect(result.name).toBe('Bob')
  })

  it('does not treat source.appId (an app GUID) as the owner', () => {
    expect(transformContact(makeRaw()).owner_id).toBeUndefined()
  })

  it('does not treat info.company (a name) as a company id', () => {
    expect(transformContact(makeRaw()).company_id).toBeUndefined()
  })

  it('parses a contact projected to id only', () => {
    const result = ContactSchema.parse(transformContact({ id: 'abc' }))
    expect(result.name).toBeUndefined()
  })

  it('throws on a contact without an id', () => {
    expect(() => transformContact(makeRaw({ id: undefined }))).toThrow(/no id/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })
})

describe('wix-crm untransformContact', () => {
  it('returns an object with info key', () => {
    const result = untransformContact({ first_name: 'Alice', email: 'a@wix.com' })
    expect(result.info).toBeDefined()
  })

  it('maps title to info.jobTitle', () => {
    const result = untransformContact({ title: 'CTO' }) as { info: { jobTitle?: string } }
    expect(result.info.jobTitle).toBe('CTO')
  })
})
