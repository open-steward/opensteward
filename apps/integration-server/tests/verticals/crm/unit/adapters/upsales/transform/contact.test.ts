import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/crm/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/crm/adapters/upsales/transform/contact'
import { CONTACT_GET, CONTACT_LIST } from '../fixtures'

describe('upsales transformContact (documented "Get contact" sample)', () => {
  it('maps the documented fields', () => {
    const raw = CONTACT_GET.data
    const c = ContactSchema.parse(transformContact(raw))
    expect(c.id).toBe('3')
    expect(c.name).toBe('Richard Hendricks')
    expect(c.email).toBe('richard.hendricks@piedpiper.com')
    expect(c.title).toBe('CEO')
    expect(c.phone).toBeNull()
    expect(c.company_id).toBe('2')
    expect(c.created_at).toBe('2018-04-21T10:35:57.000Z')
    expect(c.updated_at).toBe('2018-04-21T10:35:57.000Z')
    expect(c.owner_id).toBeUndefined()
    expect(c.metadata).toEqual(raw)
  })

  it('maps cellPhone to mobile', () => {
    const erlich = CONTACT_LIST.data.find((r) => r.id === 5)!
    const c = ContactSchema.parse(transformContact(erlich))
    expect(c.mobile).toBe('0732231312')
    expect(c.phone).toBe('08-860 804 04')
  })

  it('parses every row of the documented "Get contact list" sample', () => {
    for (const raw of CONTACT_LIST.data) {
      expect(ContactSchema.parse(transformContact(raw)).id).toBe(String(raw.id))
    }
  })

  it('keeps regDate and modDate apart (sample row 1 has distinct dates)', () => {
    const raw = CONTACT_LIST.data.find((r) => r.id === 1)!
    const c = ContactSchema.parse(transformContact(raw))
    expect(c.created_at).toBe('2018-04-21T10:08:54.000Z')
    expect(c.updated_at).toBe('1979-12-31T23:00:00.000Z')
  })
})
