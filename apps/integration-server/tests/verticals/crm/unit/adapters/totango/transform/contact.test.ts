/**
 * Totango user search hit → canonical Contact.
 *
 * Fixture: the sample response of POST /api/v1/search/users in
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 * (fetched as https://support.totango.com/api/v2/help_center/en-us/articles/204174135.json):
 *
 *   "name":"moris@123.com",
 *   "display_name":"moris@123.com",
 *   "first_activity_time":1404296416000,
 *   "last_activity_time":1423058976000,
 *   "selected_fields":[1423058976000,1589]
 *
 * and "the user name and id along with the account name and account-id are
 * always returned".
 */
import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawTotangoUser,
} from '../../../../../../../src/verticals/crm/adapters/totango/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'

function documentedHit(): RawTotangoUser {
  return {
    name: 'moris@123.com',
    display_name: 'moris@123.com',
    first_activity_time: 1404296416000,
    last_activity_time: 1423058976000,
    selected_fields: [1423058976000, 1589],
  }
}

describe('totango transformContact', () => {
  it('parses the documented sample hit with ContactSchema', () => {
    const out = ContactSchema.parse(transformContact(documentedHit()))
    expect(out.id).toBe('moris@123.com')
    expect(out.name).toBe('moris@123.com')
  })

  it('takes the id from `name` and the display name from `display_name`', () => {
    const out = transformContact({ ...documentedHit(), name: 'u-9', display_name: 'Jane Doe' })
    expect(out.id).toBe('u-9')
    expect(out.name).toBe('Jane Doe')
  })

  it('does not read the user id as an email: the docs never say it is one', () => {
    const out = transformContact(documentedHit())
    expect(out.email).toBeUndefined()
    expect(Object.keys(out).sort()).toEqual(['id', 'metadata', 'name'])
  })

  it('omits name when display_name is absent', () => {
    const raw = { ...documentedHit(), display_name: undefined }
    const out = ContactSchema.parse(transformContact(raw))
    expect(out.name).toBeUndefined()
  })

  it('keeps the raw hit as metadata', () => {
    const raw = documentedHit()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('throws on a hit without the user id rather than inventing one', () => {
    const raw = { ...documentedHit(), name: '' } as RawTotangoUser
    expect(() => transformContact(raw)).toThrow(/user id/)
  })
})
