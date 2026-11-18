import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type OutvioShipment,
} from '../../../../../../../src/verticals/logistics/adapters/outvio/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// NOTE: ShipmentSchema.cost uses MoneySchema where amount is z.number().int() (minor units).
// parseDecimal(raw.cost) returns the number unchanged, so we pass an integer
// to ensure schema parse succeeds.

function makeRawShipment(overrides: Partial<OutvioShipment> = {}): OutvioShipment {
  return {
    id: 'shp-001',
    reference: 'ORD-2024-001',
    status: 'shipped',
    trackingNumber: 'OV9876543210ES',
    carrierId: 'correos',
    serviceCode: 'PAQPREMIUM',
    originAddress: {
      name: 'Acme Warehouse',
      address1: '1 Warehouse Way',
      city: 'Valencia',
      country: 'ES',
    },
    destinationAddress: {
      name: 'Jane Doe',
      address1: '123 Main St',
      city: 'Madrid',
      zip: '28001',
      country: 'ES',
    },
    weight: 2.5,
    weightUnit: 'kg',
    length: 40,
    width: 30,
    height: 20,
    dimensionUnit: 'cm',
    labelUrl: 'https://labels.outvio.com/shp-001.pdf',
    cost: 1250,
    currency: 'EUR',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    actualDeliveryDate: '2024-03-04T12:00:00Z',
    orderId: 'ord-001',
    notes: 'Fragile',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeRawShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('OV9876543210ES')
    expect(result.carrierId).toBe('correos')
    expect(result.serviceCode).toBe('PAQPREMIUM')
    expect(result.reference).toBe('ORD-2024-001')
    expect(result.notes).toBe('Fragile')
    expect(result.labelUrl).toBe('https://labels.outvio.com/shp-001.pdf')
  })

  it('maps origin and destination addresses', () => {
    const raw = makeRawShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Acme Warehouse')
    expect(result.originAddress?.city).toBe('Valencia')
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('Madrid')
    expect(result.destinationAddress?.postalCode).toBe('28001')
  })

  it('maps weight and dimensions', () => {
    const raw = makeRawShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.dimensions?.length).toBe(40)
    expect(result.dimensions?.width).toBe(30)
    expect(result.dimensions?.height).toBe(20)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps cost with amount and currency', () => {
    const raw = makeRawShipment()
    const result = transformShipment(raw)

    expect(result.cost?.amount).toBe(1250)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps date fields to Date objects', () => {
    const raw = makeRawShipment()
    const result = transformShipment(raw)

    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes schema validation for a well-formed shipment', () => {
    const result = transformShipment(makeRawShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['processing', 'LABEL_CREATED'],
      ['label_created', 'LABEL_CREATED'],
      ['shipped', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['intransit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['out for delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['exception', 'EXCEPTION'],
      ['failed', 'EXCEPTION'],
      ['failure', 'EXCEPTION'],
      ['something_unknown', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeRawShipment({ status })).status).toBe(expected)
    }
  })

  it('maps snake_case fields when camelCase is absent', () => {
    const raw: OutvioShipment = {
      id: 'shp-snake',
      tracking_number: 'TRK-SNAKE',
      status: 'in_transit',
      origin_address: { name: 'Origin', city: 'Barcelona', country: 'ES' },
      destination_address: { name: 'Dest', city: 'Zaragoza', country: 'ES' },
      weight: 1.0,
      weight_unit: 'kg',
      label_url: 'https://labels.example.com/shp-snake.pdf',
      cost: 800,
      currency: 'EUR',
      estimated_delivery_date: '2024-03-07T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    }
    const result = transformShipment(raw)
    expect(result.trackingNumber).toBe('TRK-SNAKE')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.originAddress?.city).toBe('Barcelona')
    expect(result.labelUrl).toBe('https://labels.example.com/shp-snake.pdf')
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('falls back to carrier field when carrierId is absent', () => {
    const raw = makeRawShipment({ carrierId: undefined, carrier: 'dhl' })
    expect(transformShipment(raw).carrierId).toBe('dhl')
  })

  it('defaults currency to EUR when not provided', () => {
    const raw = makeRawShipment({ currency: undefined })
    expect(transformShipment(raw).cost?.currency).toBe('EUR')
  })

  it('omits dimensions when any dimension is null', () => {
    const result = transformShipment(makeRawShipment({ length: null, width: null, height: null }))
    expect(result.dimensions).toBeUndefined()
  })

  it('omits dimensions when only some dimensions are provided', () => {
    const result = transformShipment(makeRawShipment({ height: null }))
    expect(result.dimensions).toBeUndefined()
  })

  it('omits cost when raw.cost is null', () => {
    const result = transformShipment(makeRawShipment({ cost: null }))
    expect(result.cost).toBeUndefined()
  })

  it('maps return address', () => {
    const raw = makeRawShipment({
      returnAddress: {
        name: 'Return Dept',
        address1: '1 Return Rd',
        city: 'Valencia',
        country: 'ES',
      },
    })
    const result = transformShipment(raw)
    expect(result.returnAddress?.name).toBe('Return Dept')
    expect(result.returnAddress?.city).toBe('Valencia')
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRawShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: OutvioShipment = { id: 'shp-min', status: 'pending' }
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-min')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.cost).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })
})
