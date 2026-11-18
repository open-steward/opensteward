import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformSearchResult,
  type SinayShipmentResponse,
  type SinaySearchShipmentResult,
} from '../../../../../../../src/verticals/logistics/adapters/sinay/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<SinayShipmentResponse> = {}): SinayShipmentResponse {
  return {
    shipmentType: 'CT',
    shipmentNumber: 'MAEU123456789',
    sealine: 'MAEU',
    sealineName: 'Maersk',
    shippingStatus: 'IN_TRANSIT',
    updatedAt: '2024-03-01T00:00:00Z',
    containers: [
      {
        number: 'MSCU1234567',
        isoCode: '40HC',
        sizeType: '40HC',
        status: 'IN_TRANSIT',
        events: [],
      },
    ],
    route: {
      pol: {
        name: 'Shanghai',
        locode: 'CNSHA',
        country: 'CN',
        date: '2024-02-15T00:00:00Z',
        actual: true,
        predictiveEta: null,
      },
      pod: {
        name: 'Los Angeles',
        locode: 'USLAX',
        country: 'US',
        date: '2024-03-20T00:00:00Z',
        actual: false,
        predictiveEta: '2024-03-22T00:00:00Z',
      },
    },
    ...overrides,
  }
}

describe('Sinay transformShipment', () => {
  it('maps shipmentNumber to id and trackingNumber', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('MAEU123456789')
    expect(result.trackingNumber).toBe('MAEU123456789')
  })

  it('hardcodes carrierId as sinay', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('sinay')
  })

  it('maps IN_TRANSIT shippingStatus to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('sets mode to ocean', () => {
    const result = transformShipment(makeShipment())
    expect(result.mode).toBe('ocean')
  })

  it('maps ocean.containerNumber from first container number', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.containerNumber).toBe('MSCU1234567')
  })

  it('maps ocean.shippingLine from sealineName', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.shippingLine).toBe('Maersk')
  })

  it('maps portOfLoading locode from pol', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
  })

  it('maps portOfDischarge locode from pod', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps estimatedArrival from pod date (when pod.actual is false)', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.estimatedArrival).toBeInstanceOf(Date)
  })

  it('maps actualDeparture from pol date (when pol.actual is true)', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.actualDeparture).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps all status values correctly', () => {
    const cases: Array<[string | null | undefined, string]> = [
      ['DELIVERED', 'DELIVERED'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['IN-TRANSIT', 'IN_TRANSIT'],
      ['TRANSIT', 'IN_TRANSIT'],
      ['PLANNED', 'LABEL_CREATED'],
      ['BOOKING', 'LABEL_CREATED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      // null shippingStatus falls through to container status (IN_TRANSIT in makeShipment)
      // so use undefined to get a truly absent shippingStatus, then clear containers too
      ['SOMETHING_ELSE', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ shippingStatus: status })).status).toBe(expected)
    }
    // null/undefined shippingStatus falls back to first container status
    expect(
      transformShipment(makeShipment({ shippingStatus: null, containers: undefined })).status,
    ).toBe('UNKNOWN')
  })

  it('handles empty containers list gracefully', () => {
    const result = transformShipment(makeShipment({ containers: [] }))
    expect(result.id).toBe('MAEU123456789')
    expect(result.ocean?.containerNumber).toBe('MAEU123456789')
  })

  it('attaches raw as metadata', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

describe('Sinay transformSearchResult', () => {
  const raw: SinaySearchShipmentResult = {
    id: 'sr-001',
    shipmentNumber: 'MAEU999',
    sealine: 'MAEU',
    sealineName: 'Maersk',
    link: 'https://sinay.example/shipments/MAEU999',
  }

  it('maps id field to canonical id', () => {
    const result = transformSearchResult(raw)
    expect(result.id).toBe('sr-001')
  })

  it('maps shipmentNumber to trackingNumber', () => {
    const result = transformSearchResult(raw)
    expect(result.trackingNumber).toBe('MAEU999')
  })

  it('maps sealineName to ocean.shippingLine', () => {
    const result = transformSearchResult(raw)
    expect(result.ocean?.shippingLine).toBe('Maersk')
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformSearchResult(raw)
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('falls back to shipmentNumber as id when id is null', () => {
    const result = transformSearchResult({ ...raw, id: null })
    expect(result.id).toBe('MAEU999')
  })
})
