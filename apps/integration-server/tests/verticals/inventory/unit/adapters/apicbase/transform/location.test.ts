/**
 * GET /accounts/outlets/ (developers.apicbase.com/reference/get-outlets)
 * returns outlets carrying `id`, and no `uid`: its result items are name, id,
 * url, billing_contact, internal_supplier_outlet, timezone, description,
 * procurement_contact, contact and external_name
 * (developers.apicbase.com/openapi/apicbase.json). This transform used to read `uid`, so
 * every Location came out with an undefined id, and no stock level or
 * transfer location id matched one.
 *
 * No outlet response has a top-level `address`. The outlet's address is
 * `contact.address`: "Address fields must be nested under `contact.address`"
 * (developers.apicbase.com/reference/create-outlet), and that page's 201
 * response shows the outlet with it. The fixture's contact is that response's.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawApicbaseOutlet,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

describe('apicbase transformLocation', () => {
  const raw: RawApicbaseOutlet = {
    id: '229000541140009',
    url: 'https://app.apicbase.com/api/v2/accounts/outlets/229000541140009/',
    name: 'My outlet',
    external_name: 'My outlet external name',
    description: 'My outlet description',
    timezone: 'Europe/Brussels',
    contact: {
      id: '525000395270006',
      url: 'https://app.apicbase.com/api/v2/suppliers/525000395270006/',
      name: 'My outlet',
      contact_first_name: 'John',
      contact_last_name: 'Smith',
      email: 'email@email.com',
      address: {
        street: 'My street',
        number: '0000',
        city: 'My city',
        country: 'My Country',
        postal_code: '0000',
        mobile: '000 0000',
        telephone: null,
      },
    },
  }

  it('maps id and externalId from the documented id', () => {
    const result = transformLocation(raw)
    expect(result.id).toBe('229000541140009')
    expect(result.externalId).toBe('229000541140009')
  })

  it('does not read an id from uid, which outlets do not carry', () => {
    const result = transformLocation({
      uid: 'not-an-outlet-id',
      name: 'x',
    } as unknown as RawApicbaseOutlet)
    expect(result.id).toBe('')
  })

  it('maps name', () => {
    expect(transformLocation(raw).name).toBe('My outlet')
  })

  it('sets type to store', () => {
    expect(transformLocation(raw).type).toBe('store')
  })

  it('maps the address from contact.address, street and number on line1', () => {
    expect(transformLocation(raw).address).toEqual({
      line1: 'My street 0000',
      line2: undefined,
      city: 'My city',
      region: undefined,
      country: undefined,
      postalCode: '0000',
    })
  })

  it('keeps a free-text country as metadata, and maps an ISO 3166-1 alpha-2 one', () => {
    // Every documented country is a name ("Belgium", "My Country"); the
    // canonical address takes only an alpha-2 code.
    expect(transformLocation(raw).metadata).toEqual({ country: 'My Country' })
    const iso = transformLocation({
      ...raw,
      contact: { address: { street: 'Rue de la Loi', number: '1', country: 'BE' } },
    })
    expect(iso.address?.country).toBe('BE')
    expect(iso.address?.line1).toBe('Rue de la Loi 1')
    expect(iso.metadata).toEqual({})
  })

  it('does not read a top-level address, which no outlet response documents', () => {
    const result = transformLocation({
      id: '2',
      name: 'Store 2',
      address: { street: '123 Main St', city: 'Paris' },
    })
    expect(result.address).toBeUndefined()
  })

  it('leaves address undefined when there is no contact address, or a cleared contact', () => {
    expect(transformLocation({ id: '2', name: 'Store 2' }).address).toBeUndefined()
    expect(transformLocation({ id: '2', name: 'Store 2', contact: null }).address).toBeUndefined()
    // The GET examples' contact carries no address.
    expect(
      transformLocation({
        id: '829100725420008',
        name: 'Brussel',
        contact: { company_name: 'Baby Shark', first_name: 'Baby', last_name: 'Shark' },
      }).address,
    ).toBeUndefined()
  })

  it('sets isActive to true', () => {
    expect(transformLocation(raw).isActive).toBe(true)
  })

  it('sets platform to apicbase', () => {
    expect(transformLocation(raw).platform).toBe('apicbase')
  })

  it('produces output that satisfies LocationSchema, with a free-text country', () => {
    expect(() => LocationSchema.parse(transformLocation(raw))).not.toThrow()
  })
})
