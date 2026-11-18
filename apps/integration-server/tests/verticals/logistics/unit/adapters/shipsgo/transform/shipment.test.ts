import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  mapShipmentStatus,
  type ShipsGoContainer,
} from '../../../../../../../src/verticals/logistics/adapters/shipsgo/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeContainer(overrides: Partial<ShipsGoContainer> = {}): ShipsGoContainer {
  return {
    shipmentId: 'SG-10001',
    containerNumber: 'MSCU1234567',
    mblNumber: 'MBL-2024-001',
    bookingNumber: 'BK-2024-001',
    containerStatus: 'Sailing',
    shippingLine: 'MSC',
    scac: 'MSCU',
    vesselName: 'MSC Acacia',
    voyageNumber: 'AE042W',
    pol: 'Shanghai',
    polCode: 'CNSHA',
    pod: 'Los Angeles',
    podCode: 'USLAX',
    containerType: '40HC',
    etd: '2024-03-01T00:00:00Z',
    atd: '2024-03-02T00:00:00Z',
    eta: '2024-03-25T00:00:00Z',
    ata: null,
    isDelayed: false,
    delayDays: 0,
    transitTime: 23,
    milestones: [],
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('mapShipmentStatus (shipsgo)', () => {
  it('maps status strings correctly', () => {
    const cases: [string | null | undefined, string][] = [
      ['Gate Out', 'DELIVERED'],
      ['Delivered', 'DELIVERED'],
      ['Discharged', 'OUT_FOR_DELIVERY'],
      ['Not Released', 'OUT_FOR_DELIVERY'],
      ['Arrived', 'IN_TRANSIT'],
      ['Sailing', 'IN_TRANSIT'],
      ['Loaded', 'IN_TRANSIT'],
      ['In Transit', 'IN_TRANSIT'],
      ['Booked', 'LABEL_CREATED'],
      ['Registered', 'LABEL_CREATED'],
      ['Cancelled', 'CANCELLED'],
      ['Exception', 'EXCEPTION'],
      ['Failed delivery', 'EXCEPTION'],
      [null, 'UNKNOWN'],
      ['', 'UNKNOWN'],
      ['Unknown State', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(mapShipmentStatus(status)).toBe(expected)
    }
  })
})

describe('transformShipment (shipsgo)', () => {
  it('maps id from shipmentId (coerced to string)', () => {
    expect(transformShipment(makeContainer()).id).toBe('SG-10001')
  })

  it('uses containerNumber as trackingNumber', () => {
    expect(transformShipment(makeContainer()).trackingNumber).toBe('MSCU1234567')
  })

  it('falls back to mblNumber when containerNumber is null', () => {
    const result = transformShipment(makeContainer({ containerNumber: null }))
    expect(result.trackingNumber).toBe('MBL-2024-001')
  })

  it('maps carrierId from scac (preferred over shippingLine)', () => {
    expect(transformShipment(makeContainer()).carrierId).toBe('MSCU')
  })

  it('maps mode as "ocean"', () => {
    expect(transformShipment(makeContainer()).mode).toBe('ocean')
  })

  it('populates ocean sub-fields', () => {
    const result = transformShipment(makeContainer())
    expect(result.ocean?.containerNumber).toBe('MSCU1234567')
    expect(result.ocean?.containerType).toBe('40HC')
    expect(result.ocean?.vesselName).toBe('MSC Acacia')
    expect(result.ocean?.voyageNumber).toBe('AE042W')
    expect(result.ocean?.shippingLine).toBe('MSC')
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
    expect(result.ocean?.billOfLadingNumber).toBe('MBL-2024-001')
    expect(result.ocean?.bookingNumber).toBe('BK-2024-001')
  })

  it('maps ocean ETD/ETA/ATD to Date', () => {
    const result = transformShipment(makeContainer())
    expect(result.ocean?.estimatedDeparture).toBeInstanceOf(Date)
    expect(result.ocean?.estimatedArrival).toBeInstanceOf(Date)
    expect(result.ocean?.actualDeparture).toBeInstanceOf(Date)
    expect(result.ocean?.actualArrival).toBeUndefined()
  })

  it('maps originAddress and destinationAddress from pol/pod with polCode/podCode', () => {
    const result = transformShipment(makeContainer())
    expect(result.originAddress?.city).toBe('Shanghai')
    expect(result.originAddress?.postalCode).toBe('CNSHA')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
    expect(result.destinationAddress?.postalCode).toBe('USLAX')
  })

  it('originAddress is undefined when pol is null', () => {
    const result = transformShipment(makeContainer({ pol: null, polCode: null }))
    expect(result.originAddress).toBeUndefined()
  })

  it('maps reference from mblNumber', () => {
    expect(transformShipment(makeContainer()).reference).toBe('MBL-2024-001')
  })

  it('maps estimatedDeliveryAt from eta', () => {
    expect(transformShipment(makeContainer()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformShipment(makeContainer())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeContainer()))).not.toThrow()
  })

  it('sets metadata to raw input', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
