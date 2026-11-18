import { describe, it, expect } from 'vitest'
import {
  transformTransport,
  extractTransports,
  type TransporeonTransportDto,
  type TransporeonTransportListResponse,
  type TransporeonShipmentDto,
  type TransporeonStation,
} from '../../../../../../../src/verticals/logistics/adapters/transporeon/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeStation(
  type: 'loading' | 'unloading',
  overrides: Partial<TransporeonStation> = {},
): TransporeonStation {
  return {
    id: 'st-1',
    type,
    company_name: type === 'loading' ? 'Origin Corp' : 'Dest Corp',
    address: type === 'loading' ? '1 Origin Rd' : '2 Dest Ave',
    zip: type === 'loading' ? '10115' : '75001',
    city: type === 'loading' ? 'Berlin' : 'Paris',
    country_id: type === 'loading' ? 'DE' : 'FR',
    ...overrides,
  }
}

function makeShipmentDto(overrides: Partial<TransporeonShipmentDto> = {}): TransporeonShipmentDto {
  return {
    id: 'sdto-1',
    station: [makeStation('loading'), makeStation('unloading')],
    ...overrides,
  }
}

function makeRaw(overrides: Partial<TransporeonTransportDto> = {}): TransporeonTransportDto {
  return {
    id: 'transport-99',
    timestamp: '2024-03-01T00:00:00Z',
    number: 'TRP-0099',
    external_transport_number: 'EXT-TRP-9900',
    qualifier: 'tour.accepted',
    company_name: 'Carrier GmbH',
    assigned_carrier_id: 'carrier-5',
    assigned_carrier_name: 'FastFreight GmbH',
    start_date: '2024-03-01',
    start_time: '06:00:00',
    end_date: '2024-03-03',
    end_time: '18:00:00',
    price_basic: 1500,
    currency_id: 'EUR',
    weight: 20000,
    weight_unit: 'kg',
    comment_plain_text: 'Fragile cargo',
    vehicle_name: 'Standard Truck',
    shipments: [makeShipmentDto()],
    ...overrides,
  }
}

describe('transporeon transformTransport', () => {
  it('maps id from raw.id', () => {
    expect(transformTransport(makeRaw()).id).toBe('transport-99')
  })

  it('uses external_transport_number as trackingNumber', () => {
    expect(transformTransport(makeRaw()).trackingNumber).toBe('EXT-TRP-9900')
  })

  it('falls back to id as trackingNumber when external_transport_number is absent', () => {
    const result = transformTransport(makeRaw({ external_transport_number: undefined }))
    expect(result.trackingNumber).toBe('transport-99')
  })

  it('maps "tour.accepted" qualifier to IN_TRANSIT status', () => {
    expect(transformTransport(makeRaw({ qualifier: 'tour.accepted' })).status).toBe('IN_TRANSIT')
  })

  it('maps "tour.routed" qualifier to PENDING status', () => {
    expect(transformTransport(makeRaw({ qualifier: 'tour.routed' })).status).toBe('PENDING')
  })

  it('maps "tour.assigned.cancelled" qualifier to CANCELLED status', () => {
    expect(transformTransport(makeRaw({ qualifier: 'tour.assigned.cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps unknown qualifier to UNKNOWN status', () => {
    expect(transformTransport(makeRaw({ qualifier: 'something.weird' })).status).toBe('UNKNOWN')
  })

  it('slugifies assigned_carrier_name as carrierId', () => {
    expect(transformTransport(makeRaw()).carrierId).toBe('fastfreight-gmbh')
  })

  it('uses "transporeon" as carrierId when assigned_carrier_name is absent', () => {
    const result = transformTransport(makeRaw({ assigned_carrier_name: undefined }))
    expect(result.carrierId).toBe('transporeon')
  })

  it('sets mode to "ftl"', () => {
    expect(transformTransport(makeRaw()).mode).toBe('ftl')
  })

  it('builds originAddress from first delivery loading station', () => {
    const result = transformTransport(makeRaw())
    expect(result.originAddress?.city).toBe('Berlin')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('builds destinationAddress from last delivery unloading station', () => {
    const result = transformTransport(makeRaw())
    expect(result.destinationAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.country).toBe('FR')
  })

  it('falls back to start_city/start_country for origin when no delivery stations', () => {
    const result = transformTransport(
      makeRaw({
        shipments: undefined,
        start_city: 'Hamburg',
        start_country_id: 'DE',
        start_zip: '20095',
      }),
    )
    expect(result.originAddress?.city).toBe('Hamburg')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('converts price_basic to minor-unit cost amount (×100)', () => {
    // 1500 * 100 = 150000
    expect(transformTransport(makeRaw()).cost?.amount).toBe(150000)
    expect(transformTransport(makeRaw()).cost?.currency).toBe('EUR')
  })

  it('omits cost when price_basic is null', () => {
    expect(transformTransport(makeRaw({ price_basic: null })).cost).toBeUndefined()
  })

  it('maps weight value and unit', () => {
    const result = transformTransport(makeRaw())
    expect(result.totalWeight?.value).toBe(20000)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps reference from number field', () => {
    expect(transformTransport(makeRaw()).reference).toBe('TRP-0099')
  })

  it('maps notes from comment_plain_text', () => {
    expect(transformTransport(makeRaw()).notes).toBe('Fragile cargo')
  })

  it('maps serviceCode from vehicle_name', () => {
    expect(transformTransport(makeRaw()).serviceCode).toBe('Standard Truck')
  })

  it('sets estimatedDeliveryAt from end_date + end_time', () => {
    expect(transformTransport(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets createdAt and updatedAt from timestamp', () => {
    const result = transformTransport(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformTransport(makeRaw()))).not.toThrow()
  })
})

describe('transporeon extractTransports', () => {
  it('extracts from "transport" key', () => {
    const response: TransporeonTransportListResponse = { transport: [makeRaw()] }
    expect(extractTransports(response)).toHaveLength(1)
  })

  it('extracts from "transports" key when "transport" is absent', () => {
    const response: TransporeonTransportListResponse = { transports: [makeRaw(), makeRaw()] }
    expect(extractTransports(response)).toHaveLength(2)
  })

  it('returns empty array when both keys are absent', () => {
    expect(extractTransports({})).toHaveLength(0)
  })
})
