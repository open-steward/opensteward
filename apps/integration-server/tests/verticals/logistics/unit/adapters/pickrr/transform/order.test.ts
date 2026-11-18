import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type PickrrOrder,
  type PickrrOrderItem,
} from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PickrrOrderItem> = {}): PickrrOrderItem {
  return {
    item_name: 'Red Widget',
    sku: 'SKU-RW',
    quantity: 3,
    unit_price: 9.99,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<PickrrOrder> = {}): PickrrOrder {
  return {
    order_pk: 99001,
    order_id: 'PK-ORD-001',
    client_order_id: 'CLIENT-ORD-001',
    status: 'dispatched',
    to_name: 'Customer B',
    to_phone_number: '+919876543210',
    to_email: 'customerb@example.in',
    to_address: '1 Main Rd',
    to_city: 'Delhi',
    to_state: 'Delhi',
    to_pincode: '110001',
    to_country: 'India',
    from_name: 'Warehouse W',
    from_phone_number: '+911234567890',
    from_address: '5 Industrial Area',
    from_city: 'Gurugram',
    from_state: 'Haryana',
    from_pincode: '122001',
    from_country: 'India',
    item_name: 'Red Widget',
    tracking_id: 'PCKR-TRK-ABC',
    order_service_used: 'Delhivery',
    cod_amount: null,
    total_amount: 29.97,
    order_items: [makeItem()],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pickrr transformOrder', () => {
  it('maps id from order_pk as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('99001')
  })

  it('maps orderNumber from client_order_id', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('CLIENT-ORD-001')
  })

  it('maps SHIPPED status for dispatched', () => {
    expect(transformOrder(makeOrder({ status: 'dispatched' })).status).toBe('SHIPPED')
  })

  it('maps DELIVERED status', () => {
    expect(transformOrder(makeOrder({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps CANCELLED status', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps "rto delivered" to DELIVERED (source bug: includes("delivered") is checked before includes("rto"), so RTO returns are misclassified as DELIVERED)', () => {
    // Source bug: mapOrderStatus checks `includes('delivered')` before `includes('rto')`,
    // so "rto delivered" maps to DELIVERED instead of RETURNED.
    expect(transformOrder(makeOrder({ status: 'rto delivered' })).status).toBe('DELIVERED')
  })

  it('maps AWAITING_SHIPMENT for pickup ready', () => {
    expect(transformOrder(makeOrder({ status: 'ready to pickup' })).status).toBe(
      'AWAITING_SHIPMENT',
    )
  })

  it('maps unknown status to PENDING', () => {
    expect(transformOrder(makeOrder({ status: null })).status).toBe('PENDING')
  })

  it('maps destination address from to_* fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.name).toBe('Customer B')
    expect(r.destinationAddress?.city).toBe('Delhi')
    expect(r.destinationAddress?.postalCode).toBe('110001')
  })

  it('maps origin address from from_* fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.originAddress?.name).toBe('Warehouse W')
    expect(r.originAddress?.city).toBe('Gurugram')
  })

  it('maps shipmentIds from tracking_id', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['PCKR-TRK-ABC'])
  })

  it('omits shipmentIds when tracking_id is null', () => {
    expect(transformOrder(makeOrder({ tracking_id: null })).shipmentIds).toBeUndefined()
  })

  it('maps requestedServiceCode from order_service_used', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('Delhivery')
  })

  it('maps lineItems from order_items', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0].sku).toBe('SKU-RW')
    expect(r.lineItems?.[0].name).toBe('Red Widget')
    expect(r.lineItems?.[0].quantity).toBe(3)
    expect(r.lineItems?.[0].unitAmount).toBe(9.99)
  })

  it('maps totalAmount from total_amount when cod_amount is null', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(29.97)
  })

  it('parses created_at as createdAt Date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('parses created_at as orderAt Date', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('throws on OrderSchema validation due to source bugs: country "India" is not ISO 3166-1 alpha-2, and lineitem unit_price float violates Amount (integer minor-units)', () => {
    // Source bugs:
    // 1. pickrr passes to_country/from_country as "India" (not alpha-2 "IN"),
    //    but AddressSchema.country is Iso3166Alpha2 (exactly 2 uppercase letters).
    // 2. unit_price (9.99) is passed directly to lineitem.unitAmount but LineitemSchema
    //    requires Amount (safe integer in minor-unit cents).
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).toThrow()
  })
})
