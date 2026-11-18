import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type CdekOrder,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<CdekOrder> = {}): CdekOrder {
  return {
    uuid: 'uuid-001',
    cdek_number: 'CDEK-001',
    number: 'ORD-001',
    tariff_code: 136,
    from_location: {
      city: 'Moscow',
      address: 'Lenina 1',
      country_code: 'RU',
      region: 'Moscow Region',
      postal_code: '101000',
    },
    to_location: {
      city: 'Saint Petersburg',
      address: 'Nevsky Prospect 10',
      country_code: 'RU',
      region: 'Leningrad Region',
      postal_code: '190000',
    },
    sender: {
      name: 'Ivan Ivanov',
      company: 'Sender Co',
      email: 'ivan@example.ru',
      phones: [{ number: '+79001234567' }],
    },
    recipient: {
      name: 'Petr Petrov',
      company: 'Receiver Co',
      email: 'petr@example.ru',
      phones: [{ number: '+79007654321' }],
    },
    packages: [
      {
        number: 'pkg-001',
        weight: 1500, // grams
        length: 30,
        width: 20,
        height: 10,
      },
    ],
    delivery_detail: {
      delivery_sum: 350.0,
      currency_code: 'RUB',
    },
    statuses: [
      {
        code: 'CREATED',
        name: 'Order registered',
        date_time: '2024-03-01T00:00:00Z',
        city: 'Moscow',
      },
      { code: 'IN_TRANSIT', name: 'In transit', date_time: '2024-03-02T00:00:00Z', city: 'Tver' },
    ],
    date_created: '2024-03-01T00:00:00Z',
    date_updated: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('cdek transformShipment', () => {
  it('maps uuid to id and cdek_number to trackingNumber', () => {
    const result = transformShipment(makeRaw())
    expect(result.id).toBe('uuid-001')
    expect(result.trackingNumber).toBe('CDEK-001')
  })

  it('maps carrierId to cdek', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('cdek')
  })

  it('maps tariff_code to serviceCode as string', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('136')
  })

  it('uses last status in array for shipment status', () => {
    // last status is IN_TRANSIT → canonical IN_TRANSIT
    expect(transformShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('converts weight from grams to kg', () => {
    const result = transformShipment(makeRaw())
    // 1500g → 1.5kg
    expect(result.totalWeight?.value).toBeCloseTo(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps package dimensions in cm', () => {
    const result = transformShipment(makeRaw())
    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(10)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps delivery_detail sum and currency_code to cost', () => {
    const result = transformShipment(makeRaw())
    expect(result.cost?.amount).toBeCloseTo(350.0)
    expect(result.cost?.currency).toBe('RUB')
  })

  it('maps from_location city to originAddress city', () => {
    expect(transformShipment(makeRaw()).originAddress?.city).toBe('Moscow')
  })

  it('maps to_location city to destinationAddress city', () => {
    expect(transformShipment(makeRaw()).destinationAddress?.city).toBe('Saint Petersburg')
  })

  it('maps number to reference', () => {
    expect(transformShipment(makeRaw()).reference).toBe('ORD-001')
  })

  it('maps date_created to createdAt as Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies ShipmentSchema', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('returns UNKNOWN status when statuses array is empty', () => {
    const result = transformShipment(makeRaw({ statuses: [] }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('handles DELIVERED status code', () => {
    const result = transformShipment(
      makeRaw({
        statuses: [
          { code: 'DELIVERED', name: 'Delivered', date_time: '2024-03-03T00:00:00Z', city: 'SPb' },
        ],
      }),
    )
    expect(result.status).toBe('DELIVERED')
  })

  it('handles CANCELLED status code', () => {
    const result = transformShipment(
      makeRaw({
        statuses: [
          { code: 'CANCELLED', name: 'Cancelled', date_time: '2024-03-03T00:00:00Z', city: null },
        ],
      }),
    )
    expect(result.status).toBe('CANCELLED')
  })

  it('handles missing packages', () => {
    const result = transformShipment(makeRaw({ packages: null }))
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
