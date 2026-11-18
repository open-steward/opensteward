import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type BoxberryPvz,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

/**
 * The documented ListPoints example point, field by field:
 * https://yandex.ru/support/delivery-boxberry/ru/pages/list-points
 */
function makePvz(overrides: Partial<BoxberryPvz> = {}): BoxberryPvz {
  return {
    Code: '10.012',
    Name: 'Москва Холодильный_7712_С',
    Address: '115191, Москва г, Холодильный пер, д.3, оф. 37А',
    Phone: '+7(499)391-56-22',
    WorkShedule: 'пн-пт: 12.00-20.30, сб: 12.00-19.00',
    TripDescription: 'Метро "Тульская". Примерное расстояние от остановки до отделения - 200 м.',
    DeliveryPeriod: 1,
    CityCode: '68',
    CityName: 'Москва',
    TariffZone: '1М',
    Settlement: 'Москва',
    Area: 'Москва',
    Country: 'РОССИЯ',
    GPS: '55.7083892,37.6254865',
    AddressReduce: 'Холодильный пер, д.3, оф. 37А',
    OnlyPrepaidOrders: 'No',
    Acquiring: 'Yes',
    DigitalSignature: 'No',
    CountryCode: '643',
    NalKD: 'No',
    Metro: 'Тульская',
    TypeOfOffice: 'СПВЗ',
    VolumeLimit: '0.48',
    LoadLimit: 15,
    Postamat: false,
    ...overrides,
  }
}

describe('transformWarehouse (boxberry ListPoints)', () => {
  it('maps the documented point and parses against WarehouseSchema', () => {
    const out = WarehouseSchema.parse(transformWarehouse(makePvz()))
    expect(out.id).toBe('10.012')
    expect(out.code).toBe('10.012')
    expect(out.name).toBe('Москва Холодильный_7712_С')
    expect(out.address).toEqual({
      street1: 'Холодильный пер, д.3, оф. 37А',
      city: 'Москва',
      state: 'Москва',
      phone: '+7(499)391-56-22',
    })
  })

  it('does not map the numeric Boxberry CountryCode to the ISO alpha-2 country', () => {
    expect(transformWarehouse(makePvz()).address?.country).toBeUndefined()
  })

  it('claims no isActive or timestamps the response does not carry', () => {
    const out = transformWarehouse(makePvz())
    expect(out.isActive).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
  })

  it('keeps the full documented row in metadata', () => {
    expect(transformWarehouse(makePvz()).metadata).toMatchObject({
      Address: '115191, Москва г, Холодильный пер, д.3, оф. 37А',
      WorkShedule: 'пн-пт: 12.00-20.30, сб: 12.00-19.00',
      GPS: '55.7083892,37.6254865',
    })
  })

  it('takes id and code from Code only, with no fallback to another field', () => {
    const out = transformWarehouse(makePvz({ Code: null }))
    expect(out.id).toBeUndefined()
    expect(out.code).toBeUndefined()
    expect(out.name).toBe('Москва Холодильный_7712_С')
  })
})
