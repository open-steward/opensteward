import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PurolatorTrackingResponse,
  type PurolatorScan,
} from '../../../../../src/verticals/logistics/adapters/purolator/transform/tracking'
import {
  transformShipment,
  type PurolatorShipment,
} from '../../../../../src/verticals/logistics/adapters/purolator/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeScan(overrides: Partial<PurolatorScan> = {}): PurolatorScan {
  return {
    ScanType: 'Transit',
    Description: 'In transit to destination',
    ScanDate: '2024-03-15',
    ScanTime: '10:30:00',
    Depot: {
      Name: 'Montreal Depot',
      City: 'Montreal',
      Province: 'QC',
      Country: 'CA',
      PostalCode: 'H3A 1A1',
    },
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: { pin?: string; scans?: PurolatorScan[] } = {},
): PurolatorTrackingResponse {
  return {
    PIN: overrides.pin ?? 'PUR123456789',
    Status: 'InTransit',
    TrackingInformation: {
      Scans: {
        Scan: overrides.scans ?? [
          makeScan({ ScanType: 'Pickup', Description: 'Picked up from sender' }),
          makeScan(),
        ],
      },
    },
  }
}

function makeShipment(overrides: Partial<PurolatorShipment> = {}): PurolatorShipment {
  return {
    ShipmentPIN: 'PUR-SHP-001',
    TrackingPIN: 'PUR123456789',
    Status: 'InTransit',
    ServiceID: 'PurolatorExpress',
    TotalWeight: 5,
    WeightUnit: 'lb',
    SenderInformation: {
      name: 'Alice',
      street1: '1 Rue Principale',
      city: 'Montreal',
      state: 'QC',
      postalCode: 'H3A 1A1',
      country: 'CA',
    },
    ReceiverInformation: {
      name: 'Bob',
      street1: '100 Yonge St',
      city: 'Toronto',
      state: 'ON',
      postalCode: 'M5C 2W1',
      country: 'CA',
    },
    LabelURL: 'https://purolator.example/labels/PUR-SHP-001.pdf',
    Reference: 'REF-PUR-001',
    CreatedOn: '2024-03-15T09:00:00Z',
    UpdatedOn: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Purolator transformTracking', () => {
  it('produces one event per scan', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps scan fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('PUR123456789')
    expect(event.carrierId).toBe('purolator')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up from sender')
    expect(event.location?.city).toBe('Montreal')
    expect(event.location?.state).toBe('QC')
    expect(event.location?.country).toBe('CA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits an UNKNOWN fallback when scans are empty', () => {
    const raw: PurolatorTrackingResponse = {
      PIN: 'PUR-EMPTY',
      TrackingInformation: { Scans: { Scan: [] } },
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null depot gracefully', () => {
    const raw = makeTrackingResponse({ scans: [makeScan({ Depot: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all scan types correctly', () => {
    const cases: [string, string][] = [
      ['Pickup', 'PRE_TRANSIT'],
      ['Origin', 'PRE_TRANSIT'],
      ['Transit', 'IN_TRANSIT'],
      ['InTransit', 'IN_TRANSIT'],
      ['OnVehicle', 'OUT_FOR_DELIVERY'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['HeldForPickup', 'AVAILABLE_FOR_PICKUP'],
      ['Return', 'RETURN_TO_SENDER'],
      ['Exception', 'FAILURE'],
      ['Undeliverable', 'FAILURE'],
    ]
    for (const [t, expected] of cases) {
      const raw = makeTrackingResponse({
        scans: [makeScan({ ScanType: t, Description: null })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('falls back to description text when scan type is unknown', () => {
    const raw = makeTrackingResponse({
      scans: [makeScan({ ScanType: 'SomethingNew', Description: 'Shipment delivered to front door' })],
    })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Purolator transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('PUR-SHP-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('PUR123456789')
    expect(result.carrierId).toBe('purolator')
    expect(result.serviceCode).toBe('PurolatorExpress')
    expect(result.reference).toBe('REF-PUR-001')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Montreal')
    expect(result.destinationAddress?.city).toBe('Toronto')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      TotalWeight: null,
      WeightUnit: null,
      LabelURL: null,
      SenderInformation: null,
      ReceiverInformation: null,
      ServiceID: null,
      Status: null,
      Reference: null,
      CreatedOn: null,
      UpdatedOn: null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses', () => {
    const cases: [string | null, string][] = [
      ['Created', 'LABEL_CREATED'],
      ['InTransit', 'IN_TRANSIT'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'EXCEPTION'],
      ['Returned', 'RETURNED'],
      ['Cancelled', 'CANCELLED'],
      ['Voided', 'CANCELLED'],
      ['mystery', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ Status: status })).status).toBe(expected)
    }
  })
})
