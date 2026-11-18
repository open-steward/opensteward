import { describe, it, expect } from 'vitest'
import { transformTracking, type DpdUkTrackingResponse } from '../../../../../src/verticals/logistics/adapters/dpd-uk/transform/tracking'
import { transformShipment, type DpdUkShipmentResponse } from '../../../../../src/verticals/logistics/adapters/dpd-uk/transform/shipment'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/dpd-uk/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingResponse(overrides: Partial<DpdUkTrackingResponse> = {}): DpdUkTrackingResponse {
  return {
    consignment: [
      {
        consignmentNumber: 'CON-UK-001',
        parcelNumber: 'PCL-UK-001',
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

function makeShipmentResponse(overrides: Partial<DpdUkShipmentResponse> = {}): DpdUkShipmentResponse {
  return {
    shipmentId: 'SHP-UK-001',
    consignmentNumber: 'CON-UK-001',
    collectionDate: '2024-06-01T09:00:00Z',
    networkCode: '1^01',
    numberOfParcels: 1,
    totalWeight: 4.0,
    parcels: [
      {
        parcelNumber: 'PCL-UK-001',
        weight: 4.0,
        length: 30,
        width: 20,
        height: 15,
      },
    ],
    collectionDetails: {
      address: {
        organisation: 'Sender Ltd',
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
    manifestReference: 'MAN-UK-001',
    labels: [
      { data: 'JVBERi0xLjQ=', format: 'PDF' },
    ],
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('DPD-UK transformTracking', () => {
  it('produces one event per activity', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON-UK-001')
    expect(events).toHaveLength(3)
  })

  it('maps tracking fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON-UK-001')
    const first = events[0]

    expect(first.trackingNumber).toBe('PCL-UK-001')
    expect(first.carrierId).toBe('dpd-uk')
    expect(first.status).toBe('PRE_TRANSIT')
    expect(first.description).toBe('Parcel collected from sender')
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('maps all DPD-UK tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['COLLECTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['WITH_DRIVER', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['AT_PICKUP_SHOP', 'AVAILABLE_FOR_PICKUP'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw: DpdUkTrackingResponse = {
        consignment: [{
          consignmentNumber: 'CON1',
          parcelNumber: 'PCL1',
          events: [{ date: '2024-01-01', time: '10:00:00', statusCode, statusDescription: null, location: null, depot: null }],
        }],
      }
      expect(transformTracking(raw, 'CON1')[0].status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw: DpdUkTrackingResponse = {
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
    const events = transformTracking(raw, 'CON-UK-001')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('DPD-UK transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-UK-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('CON-UK-001')
    expect(result.carrierId).toBe('dpd-uk')
    expect(result.serviceCode).toBe('1^01')
    expect(result.reference).toBe('MAN-UK-001')
  })

  it('maps origin address from collectionDetails', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.originAddress?.name).toBe('John Sender')
    expect(result.originAddress?.company).toBe('Sender Ltd')
    expect(result.originAddress?.city).toBe('London')
    expect(result.originAddress?.postalCode).toBe('EC1A 1BB')
    expect(result.originAddress?.country).toBe('GB')
  })

  it('maps destination address from deliveryDetails', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.destinationAddress?.name).toBe('Jane Receiver')
    expect(result.destinationAddress?.company).toBe('Receiver Ltd')
    expect(result.destinationAddress?.city).toBe('Manchester')
    expect(result.destinationAddress?.postalCode).toBe('M1 1AA')
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
      ['WITH_DRIVER', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipmentResponse({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipmentResponse({ status: 'FUTURE_STATUS' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('DPD-UK transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipmentResponse()
    const entry = shipment.labels![0]
    const result = transformLabel(entry, shipment, 0)

    expect(result.id).toBe('SHP-UK-001-label-0')
    expect(result.shipmentId).toBe('SHP-UK-001')
    expect(result.trackingNumber).toBe('CON-UK-001')
    expect(result.carrierId).toBe('dpd-uk')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('JVBERi0xLjQ=')
  })

  it('passes through metadata unmodified', () => {
    const shipment = makeShipmentResponse()
    const entry = shipment.labels![0]
    const meta = transformLabel(entry, shipment, 0).metadata
    expect(meta).toEqual({ ...shipment, _labelEntry: entry })
  })
})

describe('DPD-UK transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeShipmentResponse({
      labels: [
        { data: 'JVBERi0xLjQ=', format: 'PDF' },
        { data: 'iVBORw==', format: 'PNG' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('SHP-UK-001-label-0')
    expect(labels[1].id).toBe('SHP-UK-001-label-1')
  })

  it('returns empty array when no labels exist', () => {
    const shipment = makeShipmentResponse({ labels: null })
    expect(transformLabels(shipment)).toEqual([])
  })

  it('returns empty array when labels array is empty', () => {
    const shipment = makeShipmentResponse({ labels: [] })
    expect(transformLabels(shipment)).toEqual([])
  })
})
