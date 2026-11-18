/**
 * Toast Restaurants API RestaurantInfo → Location.
 *
 * The fixture is the documented example response of GET
 * /restaurants/v1/restaurants/{restaurantGUID}
 * (https://doc.toasttab.com/doc/devguide/apiRestaurantInformation.html),
 * trimmed to `guid`, `general`, `urls` and `location`. The example's
 * `"locationName": Fenway` is quoted here (it is not valid JSON as printed),
 * and `currencyCode` is added from the `General` schema ("The ISO-4217
 * currency code used in this restaurant").
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawToastRestaurant,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

const GUID = '76cb1b05-cb1e-4adf-863a-b2a94a5ecdcf'

function makeRestaurant(overrides: Partial<RawToastRestaurant> = {}): RawToastRestaurant {
  return {
    guid: GUID,
    general: {
      archived: false,
      name: 'Trattoria Roma',
      locationName: 'Fenway',
      locationCode: '',
      description: 'Italian food in a casual atmosphere',
      timeZone: 'America/New_York',
      closeoutHour: 6,
      managementGroupGuid: 'ae6c32fe-f4d2-4dcc-aa82-f30edac96296',
      currencyCode: 'USD',
    },
    urls: {
      website: 'https://www.example.com',
    },
    location: {
      address1: '401 Park Drive',
      address2: '',
      city: 'Boston',
      stateCode: 'MA',
      zipCode: '02215',
      country: 'US',
      phone: '1112223333',
      latitude: 42.344552,
      longitude: -71.102756,
    },
    ...overrides,
  }
}

describe('transformLocation (Toast)', () => {
  it('maps the documented example and parses as a Location', () => {
    const raw = makeRestaurant()
    const result = LocationSchema.parse(transformLocation(raw, GUID))
    expect(result.id).toBe(GUID)
    expect(result.name).toBe('Trattoria Roma')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('1112223333')
    expect(result.address).toEqual({
      line1: '401 Park Drive',
      city: 'Boston',
      postalCode: '02215',
      country: 'US',
    })
    expect(result.metadata).toEqual(raw)
  })

  it('reads the region from administrativeArea, not the deprecated stateCode', () => {
    const raw = makeRestaurant()
    raw.location = { ...raw.location, administrativeArea: 'Massachusetts' }
    expect(transformLocation(raw, GUID).address?.region).toBe('Massachusetts')
  })

  it('maps general.archived to active=false and leaves active unset when absent', () => {
    const archived = makeRestaurant()
    archived.general = { ...archived.general, archived: true }
    expect(transformLocation(archived, GUID).active).toBe(false)
    const unknown = makeRestaurant()
    unknown.general = { name: 'Trattoria Roma' }
    expect(LocationSchema.parse(transformLocation(unknown, GUID)).active).toBeUndefined()
  })

  it('drops a country that is not an ISO 3166-1 alpha-2 code', () => {
    const raw = makeRestaurant()
    raw.location = { ...raw.location, country: 'United States' }
    const result = LocationSchema.parse(transformLocation(raw, GUID))
    expect(result.address?.country).toBeUndefined()
  })

  it('omits the address when location is absent', () => {
    const result = LocationSchema.parse(
      transformLocation(makeRestaurant({ location: undefined }), GUID),
    )
    expect(result.address).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('takes the id from the requested restaurant GUID', () => {
    expect(transformLocation(makeRestaurant({ guid: undefined }), GUID).id).toBe(GUID)
  })

  it('throws rather than inventing a name when general.name is absent', () => {
    expect(() => transformLocation(makeRestaurant({ general: {} }), GUID)).toThrow(/general\.name/)
  })
})
