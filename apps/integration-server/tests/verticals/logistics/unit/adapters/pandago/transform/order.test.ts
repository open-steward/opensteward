import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/order'
import type { PandagoOrder } from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<PandagoOrder> = {}): PandagoOrder {
  return {
    order_id: 'pg-ord-001',
    client_order_id: 'CLT-001',
    status: 'PICKED_UP',
    delivery_fee: 5.5,
    currency_code: 'SGD',
    description: 'Fragile items',
    payment_method: 'CASH',
    tracking_link: 'https://pandago.example/track/pg-ord-001',
    sender: {
      name: 'Alice Sender',
      phone_number: '+6590001111',
      location: {
        address: '1 Marina Blvd, Singapore',
        latitude: 1.2789,
        longitude: 103.8536,
      },
    },
    recipient: {
      name: 'Bob Receiver',
      phone_number: '+6590002222',
      location: {
        address: '99 Orchard Road, Singapore',
        latitude: 1.3021,
        longitude: 103.8354,
      },
    },
    created_at: 1709251200, // 2024-03-01T00:00:00Z in epoch seconds
    updated_at: 1709254800, // 2024-03-01T01:00:00Z
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pandago transformOrder', () => {
  it('maps id from order_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('pg-ord-001')
  })

  it('maps orderNumber from client_order_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('CLT-001')
  })

  it('maps PICKED_UP status to PROCESSING', () => {
    const result = transformOrder(makeOrder({ status: 'PICKED_UP' }))
    expect(result.status).toBe('PROCESSING')
  })

  it('maps DELIVERED status to DELIVERED', () => {
    const result = transformOrder(makeOrder({ status: 'DELIVERED' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps RETURNED_TO_VENDOR status to RETURNED', () => {
    const result = transformOrder(makeOrder({ status: 'RETURNED_TO_VENDOR' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps NEW/RECEIVED/WAITING_FOR_TRANSPORT to PENDING', () => {
    for (const s of ['NEW', 'RECEIVED', 'WAITING_FOR_TRANSPORT'] as const) {
      expect(transformOrder(makeOrder({ status: s })).status).toBe('PENDING')
    }
  })

  it('maps unknown status to PENDING (default)', () => {
    expect(transformOrder(makeOrder({ status: 'ALIEN_STATUS' })).status).toBe('PENDING')
  })

  it('maps origin address from sender.location', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.phone).toBe('+6590001111')
    expect(result.originAddress?.street1).toBe('1 Marina Blvd, Singapore')
  })

  it('maps destination address from recipient.location', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.street1).toBe('99 Orchard Road, Singapore')
  })

  it('maps currency from currency_code', () => {
    expect(transformOrder(makeOrder()).currency).toBe('SGD')
  })

  it('maps shippingAmount from delivery_fee', () => {
    expect(transformOrder(makeOrder()).shippingAmount).toBe(5.5)
  })

  it('maps notes from description', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Fragile items')
  })

  it('maps requestedServiceCode from payment_method', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('CASH')
  })

  it('converts unix epoch seconds to Date for createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('converts unix epoch seconds to Date for updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.updatedAt).toBeInstanceOf(Date)
    expect(result.updatedAt?.toISOString()).toBe('2024-03-01T01:00:00.000Z')
  })

  it('sets shipmentIds to [order_id]', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['pg-ord-001'])
  })

  it('omits originAddress when sender has no location', () => {
    const result = transformOrder(
      makeOrder({ sender: { name: 'Alice', phone_number: null, location: null } }),
    )
    expect(result.originAddress).toBeUndefined()
  })

  it('omits destinationAddress when recipient has no location', () => {
    const result = transformOrder(makeOrder({ recipient: null }))
    expect(result.destinationAddress).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
