import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/tracking'
import type { PandagoOrder } from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<PandagoOrder> = {}): PandagoOrder {
  return {
    order_id: 'pg-trk-001',
    client_order_id: 'CLT-TRK-001',
    status: 'PICKED_UP',
    delivery_fee: 4.5,
    currency_code: 'SGD',
    sender: {
      name: 'Sender',
      phone_number: '+6591110001',
      location: { address: '1 Sender St', latitude: 1.3, longitude: 103.8 },
    },
    recipient: {
      name: 'Recipient',
      phone_number: '+6591110002',
      location: { address: '2 Recipient Rd', latitude: 1.35, longitude: 103.9 },
    },
    updated_at: 1709251200, // 2024-03-01T00:00:00Z
    created_at: 1709247600, // 2024-02-29T23:00:00Z
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pandago transformTracking', () => {
  it('always returns exactly one TrackingEvent', () => {
    expect(transformTracking(makeOrder())).toHaveLength(1)
  })

  it('maps trackingNumber from order_id', () => {
    expect(transformTracking(makeOrder())[0].trackingNumber).toBe('pg-trk-001')
  })

  it('sets carrierId to "pandago"', () => {
    expect(transformTracking(makeOrder())[0].carrierId).toBe('pandago')
  })

  it('maps PICKED_UP to IN_TRANSIT', () => {
    expect(transformTracking(makeOrder({ status: 'PICKED_UP' }))[0].status).toBe('IN_TRANSIT')
  })

  it('maps NEW/RECEIVED/WAITING_FOR_TRANSPORT to PRE_TRANSIT', () => {
    for (const s of ['NEW', 'RECEIVED', 'WAITING_FOR_TRANSPORT'] as const) {
      expect(transformTracking(makeOrder({ status: s }))[0].status).toBe('PRE_TRANSIT')
    }
  })

  it('maps NEAR_CUSTOMER to OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeOrder({ status: 'NEAR_CUSTOMER' }))[0].status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps DELIVERED to DELIVERED', () => {
    expect(transformTracking(makeOrder({ status: 'DELIVERED' }))[0].status).toBe('DELIVERED')
  })

  it('maps CANCELLED to FAILURE', () => {
    expect(transformTracking(makeOrder({ status: 'CANCELLED' }))[0].status).toBe('FAILURE')
  })

  it('maps RETURNED_TO_VENDOR to FAILURE', () => {
    expect(transformTracking(makeOrder({ status: 'RETURNED_TO_VENDOR' }))[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformTracking(makeOrder({ status: 'MYSTERY' }))[0].status).toBe('UNKNOWN')
  })

  it('maps description from status field', () => {
    expect(transformTracking(makeOrder({ status: 'DELIVERED' }))[0].description).toBe('DELIVERED')
  })

  it('converts updated_at epoch seconds to Date for occurredAt', () => {
    const e = transformTracking(makeOrder())[0]
    expect(e.occurredAt).toBeInstanceOf(Date)
    expect(e.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('omits occurredAt when updated_at is null', () => {
    const e = transformTracking(makeOrder({ updated_at: null }))[0]
    expect(e.occurredAt).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrder()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('passes TrackingEventSchema validation', () => {
    expect(() => TrackingEventSchema.parse(transformTracking(makeOrder())[0])).not.toThrow()
  })
})
