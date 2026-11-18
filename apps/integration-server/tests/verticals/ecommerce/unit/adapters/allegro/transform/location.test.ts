/**
 * Fixture shaped by the Pos / Address schemas in
 * https://developer.allegro.pl/swagger.yaml (GET /points-of-service). Every
 * field name is documented there. The spec gives example values only for
 * `id` (PosLocation), `countryCode` and the street 'Grunwaldzka 182'; the
 * name, city, state and phone values below are test placeholders, not
 * spec examples.
 */
import { describe, expect, it } from 'vitest'
import {
  transformLocation,
  type RawAllegroPointOfService,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makePos(overrides: Partial<RawAllegroPointOfService> = {}): RawAllegroPointOfService {
  return {
    id: 'd5178eed-ccb6-473d-844b-d27764297d56',
    name: 'Shop Poznan',
    seller: { id: '46968690' },
    type: 'PICKUP_POINT',
    address: {
      street: 'Grunwaldzka 182',
      city: 'Poznan',
      zipCode: '60-166',
      state: 'wielkopolskie',
      countryCode: 'PL',
      coordinates: { lat: 52.409538, lon: 16.931992 },
    },
    phoneNumber: '+48600000000',
    openHours: [{ dayOfWeek: 'TUESDAY', from: '10:30:00.000', to: '17:30:00.000' }],
    confirmationType: 'CONTACT_NOT_REQUIRED',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('transformLocation (Allegro)', () => {
  it('maps the documented Pos fields and parses as a Location', () => {
    const raw = makePos()
    const loc = LocationSchema.parse(transformLocation(raw))
    expect(loc).toEqual({
      id: 'd5178eed-ccb6-473d-844b-d27764297d56',
      name: 'Shop Poznan',
      active: true,
      address: {
        line1: 'Grunwaldzka 182',
        city: 'Poznan',
        postalCode: '60-166',
        region: 'wielkopolskie',
        country: 'PL',
      },
      phone: '+48600000000',
      metadata: raw,
    })
  })

  it.each(['TEMPORARILY_CLOSED', 'CLOSED_DOWN', 'DELETED'])('%s is not active', (status) => {
    expect(LocationSchema.parse(transformLocation(makePos({ status }))).active).toBe(false)
  })

  it('throws on a point of service with no id', () => {
    expect(() => transformLocation(makePos({ id: undefined }))).toThrow(/no id/)
  })
})
