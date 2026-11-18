import { describe, it, expect } from 'vitest'
import { transformTracking, type DPDTrackingResponse } from '../../../../../src/verticals/logistics/adapters/dpd/transform/tracking'
import { transformShipment, type DPDShipmentResponse } from '../../../../../src/verticals/logistics/adapters/dpd/transform/shipment'
import { transformManifest, type DPDManifestResponse } from '../../../../../src/verticals/logistics/adapters/dpd/transform/manifest'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingResponse(overrides: Partial<DPDTrackingResponse> = {}): DPDTrackingResponse {
  return {
    consignment: [
      {
        consignmentNumber: 'CON123456',
        parcelNumber: 'PCL789',
        events: [
          {
            date: '2024-06-01',
            time: '10:30:00',
            statusCode: 'COLLECTED',
            statusDescription: 'Parcel collected from sender',
            location: 'London',
            depot: 'LON-01',
          },
          {
            date: '2024-06-02',
            time: '08:15:00',
            statusCode: 'IN_TRANSIT',
            statusDescription: 'In transit to delivery depot',
            location: 'Birmingham',
            depot: 'BHM-01',
          },
          {
            date: '2024-06-03',
            time: '14:00:00',
            statusCode: 'DELIVERED',
            statusDescription: 'Parcel delivered',
            location: 'Manchester',
            depot: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<DPDShipmentResponse> = {}): DPDShipmentResponse {
  return {
    shipmentId: 'SHP-001',
    consignmentNumber: 'CON123456',
    collectionDate: '2024-06-01T09:00:00Z',
    networkCode: '1^01',
    numberOfParcels: 2,
    totalWeight: 5.5,
    parcels: [
      {
        parcelNumber: 'PCL789',
        weight: 3.0,
        length: 30,
        width: 20,
        height: 15,
      },
      {
        parcelNumber: 'PCL790',
        weight: 2.5,
        length: 25,
        width: 15,
        height: 10,
      },
    ],
    collectionDetails: {
      address: {
        organisation: 'Sender Corp',
        countryCode: 'GB',
        postcode: 'EC1A 1BB',
        town: 'London',
        county: 'Greater London',
        street: '100 Queen St',
        locality: 'City of London',
        contactName: 'John Sender',
        contactTelephone: '+441234567890',
        contactEmail: 'john@sender.com',
      },
    },
    deliveryDetails: {
      address: {
        organisation: 'Receiver Ltd',
        countryCode: 'GB',
        postcode: 'M1 1AA',
        town: 'Manchester',
        county: 'Greater Manchester',
        street: '50 Deansgate',
        locality: null,
        contactName: 'Jane Receiver',
        contactTelephone: '+449876543210',
        contactEmail: 'jane@receiver.com',
      },
    },
    status: 'COLLECTED',
    manifestReference: 'MAN-2024-001',
    ...overrides,
  }
}

function makeManifestResponse(overrides: Partial<DPDManifestResponse> = {}): DPDManifestResponse {
  return {
    manifestId: 'MAN-001',
    manifestReference: 'MAN-2024-001',
    manifestDate: '2024-06-01T18:00:00Z',
    status: 'CLOSED',
    totalShipments: 5,
    shipmentIds: ['SHP-001', 'SHP-002', 'SHP-003', 'SHP-004', 'SHP-005'],
    carrierId: 'dpd',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking (DPD)', () => {
  it('produces one event per activity', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON123456')
    expect(events).toHaveLength(3)
  })

  it('maps tracking fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON123456')
    const first = events[0]

    expect(first.trackingNumber).toBe('PCL789')
    expect(first.carrierId).toBe('dpd')
    expect(first.status).toBe('PRE_TRANSIT')
    expect(first.description).toBe('Parcel collected from sender')
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('maps all DPD tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['COLLECTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_DEPOT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['ATTEMPTED_DELIVERY', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
    ]
    for (const [dpdStatus, expected] of cases) {
      const raw: DPDTrackingResponse = {
        consignment: [{
          consignmentNumber: 'CON1',
          parcelNumber: 'PCL1',
          events: [{ date: '2024-01-01', time: '10:00:00', statusCode: dpdStatus, statusDescription: null, location: null, depot: null }],
        }],
      }
      const events = transformTracking(raw, 'CON1')
      expect(events[0].status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw: DPDTrackingResponse = {
      consignment: [{
        consignmentNumber: 'CON1',
        parcelNumber: 'PCL1',
        events: [{ date: '2024-01-01', time: '10:00:00', statusCode: 'NEW_STATUS', statusDescription: null, location: null, depot: null }],
      }],
    }
    expect(transformTracking(raw, 'CON1')[0].status).toBe('UNKNOWN')
  })

  it('returns empty array when no consignments', () => {
    const raw = makeTrackingResponse({ consignment: [] })
    expect(transformTracking(raw, 'CON1')).toHaveLength(0)
  })

  it('returns empty array when null consignment', () => {
    const raw = makeTrackingResponse({ consignment: null })
    expect(transformTracking(raw, 'CON1')).toHaveLength(0)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON123456')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('combines date and time into occurredAt', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON123456')
    expect(events[0].occurredAt).toEqual(new Date('2024-06-01T10:30:00'))
  })

  it('handles location in tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON123456')
    expect(events[0].location?.city).toBe('London')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment (DPD)', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('CON123456')
    expect(result.carrierId).toBe('dpd')
    expect(result.serviceCode).toBe('1^01')
    expect(result.reference).toBe('MAN-2024-001')
  })

  it('maps origin address from collectionDetails', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.company).toBe('Sender Corp')
    expect(result.originAddress?.city).toBe('London')
    expect(result.originAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.originAddress?.country).toBe('GB')
  })

  it('maps destination address from deliveryDetails', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.destinationAddress?.name).toBe('Jane Receiver')
    expect(result.destinationAddress?.company).toBe('Receiver Ltd')
    expect(result.destinationAddress?.city).toBe('Manchester')
    expect(result.destinationAddress?.postalCode).toBe('M1 1AA')
  })

  it('maps weight from totalWeight', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps dimensions from first parcel', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.dimensions?.length).toBe(30)
    expect(result.dimensions?.width).toBe(20)
    expect(result.dimensions?.height).toBe(15)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps packages array', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.packages).toHaveLength(2)
    expect(result.packages![0].trackingNumber).toBe('PCL789')
    expect(result.packages![1].trackingNumber).toBe('PCL790')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipmentResponse({
      consignmentNumber: null,
      networkCode: null,
      totalWeight: null,
      parcels: null,
      collectionDetails: null,
      deliveryDetails: null,
      manifestReference: null,
    })
    const result = transformShipment(raw)

    expect(result.trackingNumber).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.reference).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['ALLOCATED', 'LABEL_CREATED'],
      ['COLLECTED', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_DEPOT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
    ]
    for (const [dpdStatus, expected] of cases) {
      const raw = makeShipmentResponse({ status: dpdStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipmentResponse({ status: 'FUTURE_STATUS' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })

  it('maps null status to UNKNOWN', () => {
    const raw = makeShipmentResponse({ status: null })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })
})

// ─── transformManifest ──────────────────────────────────────────────────────

describe('transformManifest (DPD)', () => {
  it('maps canonical fields', () => {
    const raw = makeManifestResponse()
    const result = transformManifest(raw)

    expect(result.id).toBe('MAN-001')
    expect(result.carrierId).toBe('dpd')
    expect(result.manifestNumber).toBe('MAN-2024-001')
    expect(result.status).toBe('CLOSED')
    expect(result.labelCount).toBe(5)
    expect(result.submittedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps shipmentIds', () => {
    const raw = makeManifestResponse()
    const result = transformManifest(raw)
    expect(result.shipmentIds).toEqual(['SHP-001', 'SHP-002', 'SHP-003', 'SHP-004', 'SHP-005'])
  })

  it('passes through metadata unmodified', () => {
    const raw = makeManifestResponse()
    expect(transformManifest(raw).metadata).toBe(raw)
  })

  it('maps all manifest statuses', () => {
    const cases: [string, string][] = [
      ['OPEN', 'OPEN'],
      ['CLOSED', 'CLOSED'],
      ['SUBMITTED', 'SUBMITTED'],
      ['ACCEPTED', 'ACCEPTED'],
    ]
    for (const [dpdStatus, expected] of cases) {
      const raw = makeManifestResponse({ status: dpdStatus })
      expect(transformManifest(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to OPEN', () => {
    const raw = makeManifestResponse({ status: 'UNKNOWN_STATUS' })
    expect(transformManifest(raw).status).toBe('OPEN')
  })

  it('handles null fields gracefully', () => {
    const raw = makeManifestResponse({
      manifestId: null,
      manifestReference: null,
      manifestDate: null,
      totalShipments: null,
      shipmentIds: null,
    })
    const result = transformManifest(raw)

    expect(result.id).toBeUndefined()
    expect(result.manifestNumber).toBeUndefined()
    expect(result.submittedAt).toBeUndefined()
    expect(result.labelCount).toBeUndefined()
    expect(result.shipmentIds).toBeUndefined()
  })
})
