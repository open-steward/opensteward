import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type LimeExpressTracking,
  type LimeExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/limeexpress/transform/tracking'
import {
  transformShipment,
  type LimeExpressShipment,
} from '../../../../../src/verticals/logistics/adapters/limeexpress/transform/shipment'

// --- Factories -------------------------------------------------------------

function makeEvent(overrides: Partial<LimeExpressTrackingEvent> = {}): LimeExpressTrackingEvent {
  return {
    status: 'EN_TRANSITO',
    description: 'Paquete en transito al destino',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Lima Centro',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<LimeExpressTracking> = {}): LimeExpressTracking {
  return {
    trackingNumber: 'LME123456789',
    currentStatus: 'EN_TRANSITO',
    events: [
      makeEvent({ status: 'RECIBIDO', description: 'Paquete recibido', location: 'Bogota' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<LimeExpressShipment> = {}): LimeExpressShipment {
  return {
    shipmentId: 'LME123456789',
    trackingNumber: 'LME123456789',
    status: 'RECIBIDO',
    label_url: 'https://api.limeexpress.com/labels/LME123456789.pdf',
    service_code: 'STANDARD',
    weight: 2.0,
    weight_unit: 'kg',
    sender: {
      name: 'Carlos Mendez',
      address_line1: 'Calle 50 #12-34',
      city: 'Bogota',
      postal_code: '110111',
      country: 'CO',
    },
    recipient: {
      name: 'Maria Garcia',
      address_line1: 'Av. Arequipa 1234',
      city: 'Lima',
      postal_code: '15001',
      country: 'PE',
    },
    reference: 'LME-REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// --- transformTracking -----------------------------------------------------

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'LME123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'LME123456789')[0]

    expect(event.trackingNumber).toBe('LME123456789')
    expect(event.carrierId).toBe('limeexpress')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Paquete recibido')
    expect(event.location?.city).toBe('Bogota')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'LME123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'LME123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('LME123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    const event = transformTracking(raw, 'LME123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['RECIBIDO', 'PRE_TRANSIT'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'FAILURE'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTracking({
        events: [makeEvent({ status })],
      })
      expect(transformTracking(raw, 'LME123456789')[0].status).toBe(expected)
    }
  })
})

// --- transformShipment -----------------------------------------------------

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('LME123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('LME123456789')
    expect(result.carrierId).toBe('limeexpress')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('LME123456789.pdf')
    expect(result.reference).toBe('LME-REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Carlos Mendez')
    expect(result.originAddress?.city).toBe('Bogota')
    expect(result.destinationAddress?.name).toBe('Maria Garcia')
    expect(result.destinationAddress?.city).toBe('Lima')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      trackingNumber: null,
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

    expect(result.trackingNumber).toBeUndefined()
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
      ['RECIBIDO', 'PENDING'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'EXCEPTION'],
      ['DEVUELTO', 'RETURNED'],
      ['CANCELADO', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
