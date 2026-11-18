import { describe, it, expect } from 'vitest'
import { transformLocation } from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'
import { shippingPlaceExample } from '../fixtures'

describe('transformLocation (Coupang outbound shipping location)', () => {
  it('maps the documented example and parses as a canonical Location', () => {
    const loc = LocationSchema.parse(transformLocation(shippingPlaceExample()))
    expect(loc).toEqual(
      expect.objectContaining({
        id: '1111222',
        name: '상품출고지1',
        active: true,
        phone: '02-1234-5678',
        isFulfillmentCenter: true,
        address: {
          line1: '서울특별시 송파구 신천동',
          line2: '7-30, Tower출고지',
          postalCode: '05510',
          country: 'KR',
        },
      }),
    )
  })

  it('prefers the ROADNAME address when several are listed', () => {
    const raw = shippingPlaceExample()
    raw.placeAddresses!.push({
      addressType: 'ROADNAME',
      countryCode: 'KR',
      companyContactNumber: '02-9999-0000',
      returnZipCode: '05511',
      returnAddress: '서울특별시 송파구 올림픽로 300',
      returnAddressDetail: '출고지',
    })
    const loc = LocationSchema.parse(transformLocation(raw))
    expect(loc.address?.line1).toBe('서울특별시 송파구 올림픽로 300')
    expect(loc.phone).toBe('02-9999-0000')
  })

  it('has no address when none is listed', () => {
    const loc = LocationSchema.parse(
      transformLocation({ ...shippingPlaceExample(), placeAddresses: [] }),
    )
    expect(loc.address).toBeUndefined()
    expect(loc.phone).toBeUndefined()
  })

  it('throws without a code or a name instead of inventing one', () => {
    expect(() =>
      transformLocation({ ...shippingPlaceExample(), outboundShippingPlaceCode: undefined }),
    ).toThrow(/outboundShippingPlaceCode/)
    expect(() =>
      transformLocation({ ...shippingPlaceExample(), shippingPlaceName: undefined }),
    ).toThrow(/shippingPlaceName/)
  })
})
