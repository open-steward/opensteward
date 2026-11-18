import { describe, it, expect } from 'vitest'
import {
  transformServiceOrder,
  type DispatchTrackServiceOrder,
} from '../../../../../../../src/verticals/logistics/adapters/dispatchtrack/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(o: Partial<DispatchTrackServiceOrder> = {}): DispatchTrackServiceOrder {
  return {
    id: 'dt-001',
    number: 'DT-NUM-001',
    status: 'started',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    contact_name: 'Jane Doe',
    contact_address: '123 Main St',
    contact_phone: '+15551234567',
    contact_email: 'jane@example.com',
    service_type: 'standard',
    store_code: 'WH-WEST',
    notes: 'Leave at door',
    ...o,
  }
}

describe('dispatchtrack transformServiceOrder', () => {
  it('maps id to string', () => {
    expect(transformServiceOrder(makeRaw()).id).toBe('dt-001')
  })

  it('maps number to trackingNumber', () => {
    expect(transformServiceOrder(makeRaw()).trackingNumber).toBe('DT-NUM-001')
  })

  it('maps started → OUT_FOR_DELIVERY', () => {
    expect(transformServiceOrder(makeRaw({ status: 'started' })).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps finished → DELIVERED', () => {
    expect(transformServiceOrder(makeRaw({ status: 'finished' })).status).toBe('DELIVERED')
  })

  it('maps pending → PENDING', () => {
    expect(transformServiceOrder(makeRaw({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps unable_to_finish → EXCEPTION', () => {
    expect(transformServiceOrder(makeRaw({ status: 'unable_to_finish' })).status).toBe('EXCEPTION')
  })

  it('maps cancelled → CANCELLED', () => {
    expect(transformServiceOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('unknown status → UNKNOWN', () => {
    expect(transformServiceOrder(makeRaw({ status: 'something_new' })).status).toBe('UNKNOWN')
  })

  it('sets carrierId to dispatchtrack', () => {
    expect(transformServiceOrder(makeRaw()).carrierId).toBe('dispatchtrack')
  })

  it('maps store_code to warehouseId', () => {
    expect(transformServiceOrder(makeRaw()).warehouseId).toBe('WH-WEST')
  })

  it('maps notes', () => {
    expect(transformServiceOrder(makeRaw()).notes).toBe('Leave at door')
  })

  it('builds destinationAddress from flat contact fields', () => {
    const result = transformServiceOrder(makeRaw())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.street1).toBe('123 Main St')
  })

  it('builds destinationAddress from nested address object', () => {
    const raw = makeRaw({
      address: {
        name: 'Bob Smith',
        street1: '456 Oak Ave',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
      },
    })
    const result = transformServiceOrder(raw)
    expect(result.destinationAddress?.name).toBe('Bob Smith')
    expect(result.destinationAddress?.city).toBe('Portland')
  })

  it('parses createdAt as Date', () => {
    const result = transformServiceOrder(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('falls back to identifier for trackingNumber when number absent', () => {
    const raw = makeRaw({ number: null, identifier: 'ID-XYZ' })
    expect(transformServiceOrder(raw).trackingNumber).toBe('ID-XYZ')
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformServiceOrder(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformServiceOrder(raw).metadata).toBe(raw)
  })
})
