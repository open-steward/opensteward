import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ChazkiOrder,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<ChazkiOrder> = {}): ChazkiOrder {
  return {
    id: 'ord-001',
    code: 'CHZ-ORD-001',
    reference: 'REF-001',
    order_number: 'ORD-001',
    status: 'enviado',
    customer_id: 'cust-001',
    origin: {
      name: 'Alice',
      city: 'Lima',
      country_code: 'PE',
    },
    destination: {
      name: 'Bob',
      city: 'Cusco',
      country_code: 'PE',
    },
    shipment_ids: ['shp-001', 'shp-002'],
    currency: 'PEN',
    subtotal: 100,
    tax: 18,
    shipping_cost: 10,
    discount: 0,
    total: 128,
    notes: 'Urgent',
    service: 'EXPRESS',
    order_date: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps all core fields correctly', () => {
    const result = transformOrder(makeOrder())

    expect(result.id).toBe('ord-001')
    expect(result.orderNumber).toBe('ORD-001')
    expect(result.customerId).toBe('cust-001')
    expect(result.status).toBe('SHIPPED')
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.shipmentIds).toHaveLength(2)
    expect(result.currency).toBe('PEN')
    expect(result.totalAmount).toBe(128)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  // ─── Status mapping ─────────────────────────────────────────────────────────

  describe('status mapping', () => {
    it.each([
      ['pendiente', 'PENDING'],
      ['procesando', 'PROCESSING'],
      ['en_espera', 'ON_HOLD'],
      ['listo_para_envio', 'AWAITING_SHIPMENT'],
      ['enviado', 'SHIPPED'],
      ['entregado', 'DELIVERED'],
      ['cancelado', 'CANCELLED'],
      ['devuelto', 'RETURNED'],
    ] as const)('maps %s → %s', (chazkiStatus, expected) => {
      const result = transformOrder(makeOrder({ status: chazkiStatus }))
      expect(result.status).toBe(expected)
    })

    it('maps null status to UNKNOWN', () => {
      const result = transformOrder(makeOrder({ status: null }))
      expect(result.status).toBe('UNKNOWN')
    })

    it('maps unknown status to UNKNOWN', () => {
      const result = transformOrder(makeOrder({ status: 'something_else' }))
      expect(result.status).toBe('UNKNOWN')
    })
  })

  // ─── Address fallbacks ───────────────────────────────────────────────────────

  it('falls back to sender/receiver when origin/destination are null', () => {
    const result = transformOrder(
      makeOrder({
        origin: null,
        destination: null,
        sender: { name: 'SenderAlice', city: 'Arequipa', country_code: 'PE' },
        receiver: { name: 'ReceiverBob', city: 'Trujillo', country_code: 'PE' },
      }),
    )

    expect(result.originAddress?.name).toBe('SenderAlice')
    expect(result.destinationAddress?.name).toBe('ReceiverBob')
  })

  // ─── Package fallback for shipment IDs ───────────────────────────────────────

  it('collects shipment IDs from packages when shipment_ids is null', () => {
    const result = transformOrder(
      makeOrder({
        shipment_ids: null,
        packages: [{ id: 'pkg-001' }, { id: 'pkg-002' }, { id: 'pkg-003' }],
      }),
    )

    expect(result.shipmentIds).toHaveLength(3)
    expect(result.shipmentIds).toContain('pkg-001')
    expect(result.shipmentIds).toContain('pkg-003')
  })

  it('returns undefined shipmentIds when shipment_ids is null and packages is empty', () => {
    const result = transformOrder(makeOrder({ shipment_ids: null, packages: [] }))
    expect(result.shipmentIds).toBeUndefined()
  })

  // ─── Amount fields ───────────────────────────────────────────────────────────

  it('maps subtotal, tax, shipping_cost, and discount', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalAmount).toBe(100)
    expect(result.taxAmount).toBe(18)
    expect(result.shippingAmount).toBe(10)
    expect(result.discountAmount).toBe(0)
  })

  it('falls back to total_amount when total is null', () => {
    const result = transformOrder(makeOrder({ total: null, total_amount: 250 }))
    expect(result.totalAmount).toBe(250)
  })

  // ─── Order number fallbacks ──────────────────────────────────────────────────

  it('falls back to reference for orderNumber when order_number is null', () => {
    const result = transformOrder(makeOrder({ order_number: null }))
    expect(result.orderNumber).toBe('REF-001')
  })

  it('falls back to code for orderNumber when order_number and reference are null', () => {
    const result = transformOrder(makeOrder({ order_number: null, reference: null }))
    expect(result.orderNumber).toBe('CHZ-ORD-001')
  })

  // ─── Default id fallback ─────────────────────────────────────────────────────

  it('falls back to code for id when id is null', () => {
    const result = transformOrder(makeOrder({ id: null }))
    expect(result.id).toBe('CHZ-ORD-001')
  })
})
