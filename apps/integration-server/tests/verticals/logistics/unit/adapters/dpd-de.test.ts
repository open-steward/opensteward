import { describe, it, expect } from 'vitest'
import { transformTracking, type DpdDeTrackingResponse } from '../../../../../src/verticals/logistics/adapters/dpd-de/transform/tracking'
import { transformShipment, type DpdDeShipmentResponse } from '../../../../../src/verticals/logistics/adapters/dpd-de/transform/shipment'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/dpd-de/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingResponse(overrides: Partial<DpdDeTrackingResponse> = {}): DpdDeTrackingResponse {
  return {
    consignment: [
      {
        consignmentNumber: 'CON-DE-001',
        parcelNumber: 'PCL-DE-001',
        events: [
          {
            date: '2024-06-01',
            time: '10:30:00',
            statusCode: 'PICKUP',
            statusDescription: 'Paket abgeholt',
            location: 'Berlin',
            depot: 'BER-01',
          },
          {
            date: '2024-06-02',
            time: '08:15:00',
            statusCode: 'IN_TRANSIT',
            statusDescription: 'In Transit zum Depot',
            location: 'Hamburg',
            depot: 'HAM-01',
          },
          {
            date: '2024-06-03',
            time: '14:00:00',
            statusCode: 'DELIVERED',
            statusDescription: 'Zugestellt',
            location: 'Munich',
            depot: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<DpdDeShipmentResponse> = {}): DpdDeShipmentResponse {
  return {
    shipmentId: 'SHP-DE-001',
    consignmentNumber: 'CON-DE-001',
    collectionDate: '2024-06-01T09:00:00Z',
    networkCode: '1^01',
    numberOfParcels: 1,
    totalWeight: 3.5,
    parcels: [
      {
        parcelNumber: 'PCL-DE-001',
        weight: 3.5,
        length: 30,
        width: 20,
        height: 15,
      },
    ],
    collectionDetails: {
      address: {
        organisation: 'Sender GmbH',
        countryCode: 'DE',
        postcode: '10115',
        town: 'Berlin',
        county: 'Berlin',
        street: '100 Friedrichstr',
        locality: null,
        contactName: 'Hans Sender',
        contactTelephone: '+4930123456',
        contactEmail: 'hans@sender.de',
      },
    },
    deliveryDetails: {
      address: {
        organisation: 'Empfaenger GmbH',
        countryCode: 'DE',
        postcode: '80331',
        town: 'Munich',
        county: 'Bayern',
        street: '50 Marienplatz',
        locality: null,
        contactName: 'Klaus Receiver',
        contactTelephone: '+4989123456',
        contactEmail: 'klaus@receiver.de',
      },
    },
    status: 'IN_TRANSIT',
    manifestReference: 'MAN-DE-001',
    labels: [
      { data: 'JVBERi0xLjQ=', format: 'PDF' },
    ],
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('DPD-DE transformTracking', () => {
  it('produces one event per activity', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON-DE-001')
    expect(events).toHaveLength(3)
  })

  it('maps tracking fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'CON-DE-001')
    const first = events[0]

    expect(first.trackingNumber).toBe('PCL-DE-001')
    expect(first.carrierId).toBe('dpd-de')
    expect(first.status).toBe('PRE_TRANSIT')
    expect(first.description).toBe('Paket abgeholt')
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('maps all DPD-DE tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['PICKUP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['AT_PARCELSHOP', 'AVAILABLE_FOR_PICKUP'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw: DpdDeTrackingResponse = {
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
    const raw: DpdDeTrackingResponse = {
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
    const events = transformTracking(raw, 'CON-DE-001')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('DPD-DE transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-DE-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('CON-DE-001')
    expect(result.carrierId).toBe('dpd-de')
    expect(result.serviceCode).toBe('1^01')
    expect(result.reference).toBe('MAN-DE-001')
  })

  it('maps origin address from collectionDetails', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.originAddress?.name).toBe('Hans Sender')
    expect(result.originAddress?.company).toBe('Sender GmbH')
    expect(result.originAddress?.city).toBe('Berlin')
  })

  it('maps destination address from deliveryDetails', () => {
    const result = transformShipment(makeShipmentResponse())

    expect(result.destinationAddress?.name).toBe('Klaus Receiver')
    expect(result.destinationAddress?.city).toBe('Munich')
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
      ['PICKUP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'EXCEPTION'],
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

describe('DPD-DE transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipmentResponse()
    const entry = shipment.labels![0]
    const result = transformLabel(entry, shipment, 0)

    expect(result.id).toBe('SHP-DE-001-label-0')
    expect(result.shipmentId).toBe('SHP-DE-001')
    expect(result.trackingNumber).toBe('CON-DE-001')
    expect(result.carrierId).toBe('dpd-de')
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

describe('DPD-DE transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeShipmentResponse({
      labels: [
        { data: 'JVBERi0xLjQ=', format: 'PDF' },
        { data: 'iVBORw==', format: 'PNG' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('SHP-DE-001-label-0')
    expect(labels[1].id).toBe('SHP-DE-001-label-1')
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
