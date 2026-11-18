import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceLocation,
  type RawLogicommercePhysicalLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'
import { fixture } from '../fixtures/load'

const listed = fixture<{ PHYSICALLOCATIONS: RawLogicommercePhysicalLocation[] }>('locations')
  .PHYSICALLOCATIONS[0]!
const single = fixture<RawLogicommercePhysicalLocation>('location')

describe('transformLogicommerceLocation', () => {
  it.each([
    ['GET /physicalLocations row', listed],
    ['GET /physicalLocations/{id}', single],
  ])('maps the documented %s example to a valid canonical Location', (_label, raw) => {
    const out = LocationSchema.parse(transformLogicommerceLocation(raw))
    expect(out).toMatchObject({
      id: '1',
      name: 'TLG Commerce',
      active: true,
      phone: '123456789',
      address: {
        line1: 'Bisbe Torres i Bages, 3',
        city: 'Igualada',
        region: 'Barcelona',
        postalCode: '08700',
        country: 'ES',
      },
    })
    expect(out.metadata).toEqual(raw)
  })

  it('leaves out an address it was not given', () => {
    const out = LocationSchema.parse(transformLogicommerceLocation({ ID: 2, NAME: 'Store' }))
    expect(out.address).toBeUndefined()
    expect(out.active).toBeUndefined()
  })

  it.each(['XX', 'es', 'ESP'])(
    'leaves out a COUNTRYCODE %s that is not an assigned ISO 3166-1 alpha-2 code',
    (code) => {
      const out = LocationSchema.parse(
        transformLogicommerceLocation({
          ID: 2,
          NAME: 'Store',
          CITY: 'Igualada',
          COUNTRYCODE: code,
        }),
      )
      expect(out.address).toEqual({ city: 'Igualada' })
    },
  )

  it('throws rather than invent a name', () => {
    expect(() => transformLogicommerceLocation({ ID: 2 })).toThrow(/no NAME/)
  })
})
