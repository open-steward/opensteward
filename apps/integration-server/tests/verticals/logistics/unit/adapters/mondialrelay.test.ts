import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type MondialRelayTrackingResponse,
  type MondialRelayTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/mondialrelay/transform/tracking'
import {
  transformShipment,
  type MondialRelayShipment,
} from '../../../../../src/verticals/logistics/adapters/mondialrelay/transform/shipment'
import { transformLabel, transformLabels } from '../../../../../src/verticals/logistics/adapters/mondialrelay/transform/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<MondialRelayTrackingEvent> = {}): MondialRelayTrackingEvent {
  return {
    code: 'EN_TRANSIT',
    description: 'Colis en transit',
    date: '2024-03-15T10:30:00Z',
    location: 'Paris',
    country: 'FR',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<MondialRelayTrackingResponse> = {}): MondialRelayTrackingResponse {
  return {
    tracking_number: 'MR123456789',
    status: 'EN_TRANSIT',
    events: [
      makeTrackingEvent({ code: 'PRIS_EN_CHARGE', description: 'Colis pris en charge', location: 'Lyon' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<MondialRelayShipment> = {}): MondialRelayShipment {
  return {
    shipment_id: 'shp-mr-001',
    tracking_number: 'MR123456789',
    status: 'PRIS_EN_CHARGE',
    service_code: 'RELAY_STANDARD',
    weight: 1.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Dupont',
      street1: '10 Rue de Rivoli',
      city: 'Paris',
      postal_code: '75001',
      country: 'FR',
    },
    recipient: {
      name: 'Bob Martin',
      street1: '5 Grand Place',
      city: 'Brussels',
      postal_code: '1000',
      country: 'BE',
    },
    relay_point_id: 'RP-12345',
    label_url: 'https://api.mondialrelay.com/labels/shp-mr-001.pdf',
    labels: [
      { data: 'JVBERi0xLjQ=', format: 'PDF' },
    ],
    reference: 'REF-MR-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('MondialRelay transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('MR123456789')
    expect(event.carrierId).toBe('mondialrelay')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Colis pris en charge')
    expect(event.location?.city).toBe('Lyon')
    expect(event.location?.country).toBe('FR')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('MR123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['PRIS_EN_CHARGE', 'PRE_TRANSIT'],
      ['EN_TRANSIT', 'IN_TRANSIT'],
      ['DISPONIBLE_POINT_RELAIS', 'AVAILABLE_FOR_PICKUP'],
      ['LIVRE', 'DELIVERED'],
      ['NON_LIVRE', 'FAILURE'],
      ['RETOUR', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ code })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('MondialRelay transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-mr-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('MR123456789')
    expect(result.carrierId).toBe('mondialrelay')
    expect(result.serviceCode).toBe('RELAY_STANDARD')
    expect(result.reference).toBe('REF-MR-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Dupont')
    expect(result.originAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.name).toBe('Bob Martin')
    expect(result.destinationAddress?.city).toBe('Brussels')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
      label_url: null,
      sender: null,
      recipient: null,
      service_code: null,
      status: null,
      reference: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['PRIS_EN_CHARGE', 'PENDING'],
      ['EN_TRANSIT', 'IN_TRANSIT'],
      ['DISPONIBLE_POINT_RELAIS', 'IN_TRANSIT'],
      ['LIVRE', 'DELIVERED'],
      ['NON_LIVRE', 'EXCEPTION'],
      ['RETOUR', 'RETURNED'],
      ['ANNULE', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('MondialRelay transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeShipment()
    const entry = shipment.labels![0]
    const result = transformLabel(entry, shipment, 0)

    expect(result.id).toBe('shp-mr-001-label-0')
    expect(result.shipmentId).toBe('shp-mr-001')
    expect(result.trackingNumber).toBe('MR123456789')
    expect(result.carrierId).toBe('mondialrelay')
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

describe('MondialRelay transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeShipment({
      labels: [
        { data: 'JVBERi0xLjQ=', format: 'PDF' },
        { data: 'iVBORw==', format: 'PNG' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('shp-mr-001-label-0')
    expect(labels[1].id).toBe('shp-mr-001-label-1')
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
