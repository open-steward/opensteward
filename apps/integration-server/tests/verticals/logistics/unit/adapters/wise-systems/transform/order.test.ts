import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/order'
import { type WiseSystemsTask } from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<WiseSystemsTask> = {}): WiseSystemsTask {
  return {
    id: 'task-ws-order-001',
    type: 'delivery',
    status: 1,
    location: {
      address1: '100 Main St',
      city: 'Houston',
      state: 'TX',
      postal_code: '77001',
      country: 'US',
    },
    props: {
      reference: 'ORD-WS-001',
      notes: 'Handle with care',
      completed_at: '2024-03-05T14:00:00Z',
    },
    origin: {
      address1: '500 Warehouse Blvd',
      city: 'San Antonio',
      state: 'TX',
      postal_code: '78201',
      country: 'US',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (wise-systems)', () => {
  it('maps id from raw.id', () => {
    expect(transformOrder(makeRaw()).id).toBe('task-ws-order-001')
  })

  it('maps orderNumber from props.reference', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('ORD-WS-001')
  })

  it('falls back orderNumber to raw.id when props.reference is absent', () => {
    const raw = makeRaw({ props: { ...makeRaw().props, reference: null } })
    expect(transformOrder(raw).orderNumber).toBe('task-ws-order-001')
  })

  it('maps status 0 → PENDING', () => {
    expect(transformOrder(makeRaw({ status: 0 })).status).toBe('PENDING')
  })

  it('maps status 1 → PROCESSING', () => {
    expect(transformOrder(makeRaw({ status: 1 })).status).toBe('PROCESSING')
  })

  it('maps status 2 → SHIPPED', () => {
    expect(transformOrder(makeRaw({ status: 2 })).status).toBe('SHIPPED')
  })

  it('maps status 3 → DELIVERED', () => {
    expect(transformOrder(makeRaw({ status: 3 })).status).toBe('DELIVERED')
  })

  it('maps unknown status → unknown', () => {
    // The source returns 'unknown' (lowercase) for default case
    expect(transformOrder(makeRaw({ status: null })).status).toBe('unknown')
  })

  it('maps destinationAddress from location', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.city).toBe('Houston')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps originAddress from origin', () => {
    const result = transformOrder(makeRaw())
    expect(result.originAddress?.city).toBe('San Antonio')
  })

  it('maps notes from props.notes', () => {
    expect(transformOrder(makeRaw()).notes).toBe('Handle with care')
  })

  it('maps deliveredAt from props.completed_at', () => {
    expect(transformOrder(makeRaw()).deliveredAt).toBeInstanceOf(Date)
  })

  it('maps shippedAt from raw.updated_at', () => {
    expect(transformOrder(makeRaw()).shippedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from raw.created_at', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from raw.updated_at', () => {
    expect(transformOrder(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  // NOTE: wise-systems transformOrder emits status 'unknown' (lowercase) which is
  // accepted by OrderSchema via withUnknown helper — confirmed valid
  it('produces output that parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
