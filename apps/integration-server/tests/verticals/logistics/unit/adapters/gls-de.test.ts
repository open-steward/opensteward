import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GlsDeShipment,
} from '../../../../../src/verticals/logistics/adapters/gls-de/transform/shipment'
import { transformTracking, type GlsDeTracking } from '../../../../../src/verticals/logistics/adapters/gls-de/transform/tracking'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/gls-de/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<GlsDeShipment> = {}): GlsDeShipment {
  return {
    shipmentId: 'shp-glsde-001',
    status: 'INTRANSIT',
    consignmentId: 'CON-DE-123',
    parcels: [
      { parcelNumber: 'P001', trackId: 'GLSDE1234567890', weight: 2.5 },
    ],
    sender: {
      name: 'Hans Sender',
      company: 'Sender GmbH',
      street1: '10 Friedrichstr',
      city: 'Berlin',
      state: 'BE',
      postal_code: '10115',
      country: 'DE',
      phone: '+49301234567',
      email: 'hans@sender.de',
    },
    receiver: {
      name: 'Klaus Receiver',
      company: 'Receiver GmbH',
      street1: '5 Marienplatz',
      city: 'Munich',
      state: 'BY',
      postal_code: '80331',
      country: 'DE',
      phone: '+49891234567',
      email: 'klaus@receiver.de',
    },
    shipper: null,
    weight: 2.5,
    weightUnit: 'kg',
    length: 40,
    width: 30,
    height: 20,
    dimensionUnit: 'cm',
    product: 'BusinessParcel',
    serviceCode: 'BP',
    reference: 'REF-GLSDE-001',
    labelUrl: 'https://api.gls-group.eu/de/labels/shp-glsde-001.pdf',
    labels: [
      { data: 'JVBERi0xLjQ=', format: 'PDF' },
    ],
    createdAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<GlsDeTracking> = {}): GlsDeTracking {
  return {
    tuNo: 'GLSDE1234567890',
    status: 'INTRANSIT',
    history: [
      {
        date: '2024-03-15',
        time: '10:00:00',
        description: 'Paket abgeholt',
        location: 'Berlin',
        country: 'DE',
        code: 'PREADVICE',
      },
      {
        date: '2024-03-15',
        time: '16:30:00',
        description: 'Paket unterwegs',
        location: 'Leipzig Hub',
        country: 'DE',
        code: 'INTRANSIT',
      },
    ],
    deliveredTo: null,
    deliveryDate: null,
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('GLS-DE transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-glsde-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('GLSDE1234567890')
    expect(result.carrierId).toBe('gls-de')
    expect(result.serviceCode).toBe('BP')
    expect(result.reference).toBe('REF-GLSDE-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Hans Sender')
    expect(result.originAddress?.city).toBe('Berlin')
    expect(result.destinationAddress?.name).toBe('Klaus Receiver')
    expect(result.destinationAddress?.city).toBe('Munich')
  })

  it('maps weight and dimensions', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
    expect(result.dimensions?.length).toBe(40)
    expect(result.dimensions?.width).toBe(30)
    expect(result.dimensions?.height).toBe(20)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      length: null,
      width: null,
      height: null,
      sender: null,
      receiver: null,
      reference: null,
      labelUrl: null,
      labels: null,
      createdAt: null,
      parcels: [],
      consignmentId: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.dimensions).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['PREADVICE', 'PENDING'],
      ['CREATED', 'PENDING'],
      ['INTRANSIT', 'IN_TRANSIT'],
      ['INDELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [glsStatus, expected] of cases) {
      const raw = makeShipment({ status: glsStatus })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('GLS-DE transformTracking', () => {
  it('produces one event per history entry', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'GLSDE1234567890')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'GLSDE1234567890')[0]

    expect(event.trackingNumber).toBe('GLSDE1234567890')
    expect(event.carrierId).toBe('gls-de')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Paket abgeholt')
    expect(event.location?.city).toBe('Berlin')
    expect(event.location?.country).toBe('DE')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'GLSDE1234567890')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when history is empty', () => {
    const raw = makeTracking({ history: [] })
    const events = transformTracking(raw, 'GLSDE1234567890')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('GLSDE1234567890')
  })

  it('maps event codes correctly', () => {
    const cases: [string, string][] = [
      ['PREADVICE', 'PRE_TRANSIT'],
      ['INTRANSIT', 'IN_TRANSIT'],
      ['INDELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
      ['PARCELSHOP', 'AVAILABLE_FOR_PICKUP'],
      ['OTHER', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTracking({
        history: [
          {
            date: '2024-03-15',
            time: '10:00:00',
            description: 'test',
            location: null,
            country: null,
            code,
          },
        ],
      })
      expect(transformTracking(raw, 'GLSDE1234567890')[0].status).toBe(expected)
    }
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      history: [
        {
          date: '2024-03-15',
          time: '10:00:00',
          description: 'test',
          location: null,
          country: null,
          code: 'INTRANSIT',
        },
      ],
    })
    expect(transformTracking(raw, 'GLSDE1234567890')[0].location).toBeUndefined()
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('GLS-DE transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipment()
    const entry = shipment.labels![0]
    const result = transformLabel(entry, shipment, 0)

    expect(result.id).toBe('shp-glsde-001-label-0')
    expect(result.shipmentId).toBe('shp-glsde-001')
    expect(result.trackingNumber).toBe('GLSDE1234567890')
    expect(result.carrierId).toBe('gls-de')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('JVBERi0xLjQ=')
  })

  it('passes through metadata unmodified', () => {
    const shipment = makeShipment()
    const entry = shipment.labels![0]
    const meta = transformLabel(entry, shipment, 0).metadata
    expect(meta).toEqual({ ...shipment, _labelEntry: entry })
  })
})

describe('GLS-DE transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeShipment({
      labels: [
        { data: 'JVBERi0xLjQ=', format: 'PDF' },
        { data: 'iVBORw==', format: 'PNG' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('shp-glsde-001-label-0')
    expect(labels[1].id).toBe('shp-glsde-001-label-1')
  })

  it('returns empty array when no labels exist', () => {
    const shipment = makeShipment({ labels: null })
    expect(transformLabels(shipment)).toEqual([])
  })

  it('returns empty array when labels array is empty', () => {
    const shipment = makeShipment({ labels: [] })
    expect(transformLabels(shipment)).toEqual([])
  })
})
