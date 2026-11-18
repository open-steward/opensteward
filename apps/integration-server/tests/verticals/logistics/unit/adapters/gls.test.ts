import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GlsShipment,
} from '../../../../../src/verticals/logistics/adapters/gls/transform/shipment'
import { transformTracking, type GlsTracking } from '../../../../../src/verticals/logistics/adapters/gls/transform/tracking'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/gls/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<GlsShipment> = {}): GlsShipment {
  return {
    shipmentId: 'shp-gls-001',
    status: 'INTRANSIT',
    consignmentId: 'CON123456',
    parcels: [
      { parcelNumber: 'P001', trackId: 'GLS1234567890', weight: 2.5 },
    ],
    sender: {
      name: 'Alice Sender',
      company: 'Sender Corp',
      street1: '10 Canal St',
      city: 'Amsterdam',
      state: 'NH',
      postal_code: '1011AA',
      country: 'NL',
      phone: '+31612345678',
      email: 'alice@example.com',
    },
    receiver: {
      name: 'Bob Receiver',
      company: 'Receiver GmbH',
      street1: '5 Hauptstr',
      city: 'Berlin',
      state: 'BE',
      postal_code: '10115',
      country: 'DE',
      phone: '+491712345678',
      email: 'bob@example.com',
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
    reference: 'REF-GLS-001',
    labelUrl: 'https://api.gls-group.eu/labels/shp-gls-001.pdf',
    labels: [
      { data: 'JVBERi0xLjQ=', format: 'PDF' },
    ],
    createdAt: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<GlsTracking> = {}): GlsTracking {
  return {
    tuNo: 'GLS1234567890',
    status: 'INTRANSIT',
    history: [
      {
        date: '2024-03-15',
        time: '10:00:00',
        description: 'Parcel collected',
        location: 'Amsterdam',
        country: 'NL',
        code: 'PREADVICE',
      },
      {
        date: '2024-03-15',
        time: '16:30:00',
        description: 'Parcel in transit',
        location: 'Eindhoven Hub',
        country: 'NL',
        code: 'INTRANSIT',
      },
    ],
    deliveredTo: null,
    deliveryDate: null,
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('GLS transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-gls-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('GLS1234567890')
    expect(result.carrierId).toBe('gls')
    expect(result.serviceCode).toBe('BP')
    expect(result.reference).toBe('REF-GLS-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Amsterdam')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Berlin')
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
      ['INWAREHOUSE', 'IN_TRANSIT'],
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

describe('GLS transformTracking', () => {
  it('produces one event per history entry', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'GLS1234567890')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'GLS1234567890')[0]

    expect(event.trackingNumber).toBe('GLS1234567890')
    expect(event.carrierId).toBe('gls')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel collected')
    expect(event.location?.city).toBe('Amsterdam')
    expect(event.location?.country).toBe('NL')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'GLS1234567890')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when history is empty', () => {
    const raw = makeTracking({ history: [] })
    const events = transformTracking(raw, 'GLS1234567890')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('GLS1234567890')
  })

  it('maps event codes correctly', () => {
    const cases: [string, string][] = [
      ['PREADVICE', 'PRE_TRANSIT'],
      ['INTRANSIT', 'IN_TRANSIT'],
      ['INWAREHOUSE', 'IN_TRANSIT'],
      ['INDELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
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
      expect(transformTracking(raw, 'GLS1234567890')[0].status).toBe(expected)
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
    expect(transformTracking(raw, 'GLS1234567890')[0].location).toBeUndefined()
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('GLS transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipment()
    const entry = shipment.labels![0]
    const result = transformLabel(entry, shipment, 0)

    expect(result.id).toBe('shp-gls-001-label-0')
    expect(result.shipmentId).toBe('shp-gls-001')
    expect(result.trackingNumber).toBe('GLS1234567890')
    expect(result.carrierId).toBe('gls')
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

describe('GLS transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeShipment({
      labels: [
        { data: 'JVBERi0xLjQ=', format: 'PDF' },
        { data: 'iVBORw==', format: 'PNG' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('shp-gls-001-label-0')
    expect(labels[1].id).toBe('shp-gls-001-label-1')
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
