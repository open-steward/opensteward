import { describe, it, expect } from 'vitest'
import {
  carriersFromServices,
  type Parcel2GoService,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// The documented `ExtendedQuoteService` example from
// https://www.parcel2go.com/api/swagger/docs/v1 (definitions.ServiceResults.example.Results[0]).
const DOC_SERVICE: Parcel2GoService = {
  CollectionCountries: [
    {
      Iso3Code: 'GBR',
      Iso2Code: 'GB',
      Subdivision: 'HIGH',
      RequiresCustoms: false,
      Name: 'UK - Highlands and Islands',
    },
  ],
  DeliveryCountries: [
    {
      DeliveryTimeMin: '01:00:00',
      DeliveryTimeMax: '3.00:00:00',
      DeliveryMinDays: 1,
      DeliveryMaxDays: 3,
      Name: 'United Kingdom',
      Iso3Code: 'GBR',
      Iso2Code: 'GB',
      RequiresCustoms: false,
    },
  ],
  CourierName: 'Example',
  CourierSlug: 'example',
  Slug: '24h-example',
  Name: 'Example 24H',
  CollectionType: 'Shop',
  DeliveryType: 'Door',
  Links: {
    ImageSmall: 'https://example.com/logo/service/10410.small',
    Imagelarge: 'https://example.com/logo/service/10410.large',
    ImageSvg: 'https://example.com/logo/service/24h-example/logo.normal-svg',
    Courier: 'https://example.com/couriers/example',
    Service: 'https://example.com/service/24h-example',
  },
  MaxHeight: 1.2,
  MaxWidth: 1.2,
  MaxLength: 1.2,
  MaxWeight: 1.55,
  MaxCover: 2500,
  IsPrinterRequired: false,
  ShortDescriptions: 'Lorem ipsum',
  Overview: '<p>Lorem ipsum dolor sit amet</p>',
  Features: '<p>Lorem ipsum dolor sit amet</p>',
  RequiresDimensions: true,
  Tags: ['EXAMPLE'],
  Classification: 'Slow',
}

describe('parcel2go carriersFromServices', () => {
  it('maps the documented example service to one schema-valid carrier', () => {
    const carriers = carriersFromServices([DOC_SERVICE])
    expect(carriers).toHaveLength(1)
    const c = CarrierSchema.parse(carriers[0])
    expect(c).toEqual({
      id: 'example',
      code: 'example',
      name: 'Example',
      services: [{ code: '24h-example', name: 'Example 24H' }],
    })
  })

  it('groups every service of one courier into one carrier, in first-seen order', () => {
    const carriers = carriersFromServices([
      DOC_SERVICE,
      { CourierSlug: 'other', CourierName: 'Other', Slug: 'other-48', Name: 'Other 48' },
      { ...DOC_SERVICE, Slug: '48h-example', Name: 'Example 48H' },
    ])
    expect(carriers.map((c) => CarrierSchema.parse(c).id)).toEqual(['example', 'other'])
    expect(carriers[0]?.services?.map((s) => s.code)).toEqual(['24h-example', '48h-example'])
  })

  it('keeps the courier name when a later service of the courier omits it', () => {
    const [c] = carriersFromServices([DOC_SERVICE, { ...DOC_SERVICE, CourierName: null }])
    expect(CarrierSchema.parse(c).name).toBe('Example')
  })

  it('keeps the first CourierName seen when services of one courier disagree', () => {
    const [c] = carriersFromServices([
      DOC_SERVICE,
      { ...DOC_SERVICE, Slug: 'example-2', CourierName: 'Example Renamed' },
    ])
    expect(CarrierSchema.parse(c).name).toBe('Example')
  })

  it('yields no carrier for a service that names no courier', () => {
    expect(carriersFromServices([{ ...DOC_SERVICE, CourierSlug: null }])).toEqual([])
  })

  it('leaves out a service without its slug rather than inventing a code', () => {
    const [c] = carriersFromServices([{ ...DOC_SERVICE, Slug: undefined }])
    expect(CarrierSchema.parse(c)).toEqual({ id: 'example', code: 'example', name: 'Example' })
  })
})
