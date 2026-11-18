import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'
import { STORE_LOCATION } from '../fixtures'

describe('StoreHippo transformLocation (documented ms-store_locations fields)', () => {
  it('maps the documented example and parses with LocationSchema', () => {
    const l = LocationSchema.parse(transformLocation(structuredClone(STORE_LOCATION)))
    expect(l).toMatchObject({
      id: '58c0e4c8029c76d907da0924',
      name: 'My Fashion Store',
      phone: '7458721694',
      address: {
        line1: '456, Baker Street',
        city: 'Gurugram',
        region: 'Haryana',
        postalCode: '122001',
        country: 'IN',
      },
    })
  })

  it('throws on a record without _id or title', () => {
    expect(() => transformLocation({ title: 'x' })).toThrow(/_id/)
    expect(() => transformLocation({ _id: 'l1' })).toThrow(/title/)
  })
})
