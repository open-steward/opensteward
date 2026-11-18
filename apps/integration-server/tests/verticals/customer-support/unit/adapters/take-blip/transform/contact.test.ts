/**
 * Fixtures are the documented "Get contacts" example items (docs.blip.ai,
 * "Contacts" > "Get contacts", response to GET /contacts?$skip=0&$take=3).
 */
import { describe, expect, it } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'
import { transformContact } from '../../../../../../../src/verticals/customer-support/adapters/take-blip/transform/contact'

const john = {
  identity: '11121023102013021@messenger.gw.msging.net',
  name: 'John Doe',
  gender: 'male',
  group: 'friends',
  extras: { plan: 'Gold', code: '1111' },
}
const joseph = {
  identity: '213121@telegram.gw.msging.net',
  name: 'Joseph from Telegram',
  email: 'ze@gmail.com',
}
const mary = { identity: '5511999990000@take.io', name: 'Mary' }

describe('take-blip transformContact', () => {
  it('maps every documented example item through the canonical schema', () => {
    for (const raw of [john, joseph, mary]) {
      const out = ContactSchema.parse(transformContact(raw))
      expect(out.id).toBe(raw.identity)
      expect(out.externalId).toBe(raw.identity)
      expect(out.name).toBe(raw.name)
      expect(out.platform).toBe('take-blip')
    }
  })

  it('reads the documented email, group and gender', () => {
    expect(ContactSchema.parse(transformContact(joseph)).email).toBe('ze@gmail.com')
    const out = ContactSchema.parse(transformContact(john))
    expect(out.email).toBeUndefined()
    expect(out.metadata).toEqual({ group: 'friends', gender: 'male' })
  })

  it('reads phoneNumber as the phone and keeps cellPhoneNumber in metadata', () => {
    // Documented property examples: phoneNumber "5531000000000", cellPhoneNumber "5531999999999".
    const out = ContactSchema.parse(
      transformContact({ ...mary, phoneNumber: '5531000000000', cellPhoneNumber: '5531999999999' }),
    )
    expect(out.phone).toBe('5531000000000')
    expect(out.metadata['cellPhoneNumber']).toBe('5531999999999')
    expect(
      ContactSchema.parse(transformContact({ ...mary, cellPhoneNumber: '5531999999999' })).phone,
    ).toBeUndefined()
  })

  it('keeps every documented optional property in metadata', () => {
    // Property examples from docs.blip.ai, "Contacts" (the properties table).
    const out = ContactSchema.parse(
      transformContact({
        identity: '11121023102013021@messenger.gw.msging.net',
        name: 'Rafael Pacheco',
        gender: 'male',
        group: 'testers',
        address: '83, Paraguassu Street',
        city: 'Belo Horizonte',
        email: 'rafaelpa@take.net',
        phoneNumber: '5531000000000',
        cellPhoneNumber: '5531999999999',
        culture: 'pt-br',
        source: 'Facebook Messenger',
        lastMessageDate: '2021-09-30T13:38:00.000Z',
      }),
    )
    expect(out.metadata).toEqual({
      group: 'testers',
      gender: 'male',
      source: 'Facebook Messenger',
      address: '83, Paraguassu Street',
      city: 'Belo Horizonte',
      culture: 'pt-br',
      cellPhoneNumber: '5531999999999',
      lastMessageDate: '2021-09-30T13:38:00.000Z',
    })
    expect(out.email).toBe('rafaelpa@take.net')
  })

  it('a contact without the optional name maps to an empty name, not its identity', () => {
    // name is "Optional" upstream and required canonically. '' is pinned here;
    // whether to use the identity instead is deferred to the lead.
    const out = ContactSchema.parse(transformContact({ identity: '5511999990000@take.io' }))
    expect(out.name).toBe('')
  })

  it('an email the schema would reject is left out instead of failing the page', () => {
    expect(
      ContactSchema.parse(transformContact({ ...mary, email: 'not an email' })).email,
    ).toBeUndefined()
  })

  it('throws on a contact without an identity', () => {
    expect(() => transformContact({ name: 'x' })).toThrow(/no identity/)
  })
})
