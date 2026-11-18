import { describe, it, expect } from 'vitest'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import {
  parseProductConfiguration,
  transformCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/bpost/transform/carrier'
import { parseXml } from '../../../../../../../src/verticals/logistics/adapters/bpost/xml'
import { PRODUCT_CONFIGURATION } from '../fixtures'

const config = () => parseProductConfiguration(parseXml(PRODUCT_CONFIGURATION))

describe('bpost parseProductConfiguration (GET /{accountId}/productconfig)', () => {
  it('reads delivery methods, products, prices and options from the documented example', () => {
    const raw = config()
    expect(raw.deliveryMethod?.map((dm) => dm.name)).toEqual([
      'home or office',
      'pick-up point',
      'Parcel locker',
      'home or office',
    ])
    const pro = raw.deliveryMethod?.[0]?.product?.find((p) => p.name === 'bpack 24h Pro')
    expect(pro?.price).toEqual([
      {
        countryIso2Code: 'BE',
        priceLessThan2: 50,
        price2To5: 550,
        price5To10: 550,
        price10To20: 550,
        price20To30: 550,
      },
    ])
    expect(pro?.option).toEqual([
      { name: 'Info "Next Day"', price: 800 },
      { name: 'Saturday', price: 100 },
    ])
    expect(raw.deliveryMethod?.[3]?.product?.[0]?.price?.map((p) => p.countryIso2Code)).toEqual([
      'AD',
      'AE',
      'AF',
    ])
  })

  it('refuses a document that is not a productConfiguration', () => {
    expect(() => parseProductConfiguration(parseXml('<orderInfo/>'))).toThrow(
      /productConfiguration/,
    )
  })
})

describe('bpost transformCarrier', () => {
  it('describes bpost as one carrier whose services are the configured product names', () => {
    const carrier = CarrierSchema.parse(transformCarrier(config()))
    expect(carrier.id).toBe('bpost')
    expect(carrier.code).toBe('bpost')
    expect(carrier.services).toEqual([
      { code: 'bpack Pallet', name: 'bpack Pallet' },
      { code: 'bpack Easy Retour', name: 'bpack Easy Retour' },
      { code: 'bpack 24h business', name: 'bpack 24h business' },
      { code: 'bpack 24h Pro', name: 'bpack 24h Pro' },
      { code: 'bpack Bus', name: 'bpack Bus' },
      { code: 'bpack@bpost', name: 'bpack@bpost' },
      { code: 'bpack 24/7', name: 'bpack 24/7' },
      { code: 'bpack Europe Business', name: 'bpack Europe Business' },
    ])
  })

  it('lists a product offered under two delivery methods once', () => {
    const raw = {
      deliveryMethod: [
        { name: 'home or office', product: [{ name: 'bpack Europe Business' }] },
        { name: 'pick-up point', product: [{ name: 'bpack Europe Business' }] },
      ],
    }
    expect(transformCarrier(raw).services).toEqual([
      { code: 'bpack Europe Business', name: 'bpack Europe Business' },
    ])
  })

  it('links to the documented item-code track page and claims no active flag', () => {
    const carrier = transformCarrier(config())
    expect(carrier.trackingUrlTemplate).toBe(
      'http://track.bpost.cloud/etr/light/performSearch.do?searchByItemCode=true&oss_language=en&itemCodes={trackingNumber}',
    )
    expect(carrier.isActive).toBeUndefined()
  })
})
