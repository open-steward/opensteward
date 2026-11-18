import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type WiseSystemsTask,
} from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<WiseSystemsTask> = {}): WiseSystemsTask {
  return {
    id: 'task-ws-001',
    type: 'delivery',
    status: 2,
    location: {
      address1: '100 Main St',
      city: 'Austin',
      state: 'TX',
      postal_code: '73301',
      country: 'US',
    },
    props: {
      reference: 'REF-WS-001',
      notes: 'Fragile',
      time_window_start: '2024-03-01T08:00:00Z',
      time_window_end: '2024-03-01T12:00:00Z',
      scheduled_at: '2024-03-01T09:00:00Z',
      completed_at: '2024-03-01T11:30:00Z',
      service_time: 15,
    },
    origin: {
      address1: '500 Depot Rd',
      city: 'Dallas',
      state: 'TX',
      postal_code: '75201',
      country: 'US',
    },
    driver_id: 'drv-001',
    vehicle_id: 'veh-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (wise-systems)', () => {
  it('maps id from raw.id', () => {
    expect(transformShipment(makeRaw()).id).toBe('task-ws-001')
  })

  it('maps trackingNumber from raw.id', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('task-ws-001')
  })

  it('sets carrierId to wise-systems', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('wise-systems')
  })

  it('maps status 2 delivery → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeRaw({ status: 2, type: 'delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status 2 pickup → IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 2, type: 'pickup' })).status).toBe('IN_TRANSIT')
  })

  it('maps status 0 → PENDING', () => {
    expect(transformShipment(makeRaw({ status: 0 })).status).toBe('PENDING')
  })

  it('maps status 1 → LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 1 })).status).toBe('LABEL_CREATED')
  })

  it('maps status 3 → DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 3 })).status).toBe('DELIVERED')
  })

  it('maps undefined status → UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: null })).status).toBe('UNKNOWN')
  })

  it('maps destinationAddress from location', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Austin')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps originAddress from origin', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Dallas')
    expect(result.originAddress?.postalCode).toBe('75201')
  })

  it('maps reference from props.reference', () => {
    expect(transformShipment(makeRaw()).reference).toBe('REF-WS-001')
  })

  it('maps notes from props.notes', () => {
    expect(transformShipment(makeRaw()).notes).toBe('Fragile')
  })

  it('maps estimatedDeliveryAt from props.time_window_end', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('falls back estimatedDeliveryAt to scheduled_at when time_window_end absent', () => {
    const raw = makeRaw({ props: { ...makeRaw().props, time_window_end: null } })
    expect(transformShipment(raw).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps actualDeliveryAt from props.completed_at', () => {
    expect(transformShipment(makeRaw()).actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from raw.created_at', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from raw.updated_at', () => {
    expect(transformShipment(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })
})
