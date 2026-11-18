import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type NetworkONOrder,
} from '../../../../../../../src/verticals/logistics/adapters/networkon/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<NetworkONOrder> = {}): NetworkONOrder {
  return {
    id: 'order-001',
    order_number: 'ORD-2024-001',
    status: 'pending',
    customer_id: 'cust-42',
    origin: {
      name: 'Sender Co',
      street1: '1 Sender Lane',
      city: 'Origin City',
      country: 'US',
    },
    destination: {
      name: 'Recipient Co',
      street1: '9 Receiver Rd',
      city: 'Dest City',
      country: 'US',
    },
    items: [
      {
        id: 'item-1',
        sku: 'SKU-001',
        name: 'Widget',
        description: 'A widget',
        quantity: 3,
        unit_price: 1000,
        total_price: 3000,
      },
    ],
    currency: 'USD',
    subtotal: 3000,
    tax: 150,
    shipping_cost: 500,
    discount: 0,
    total: 3650,
    notes: 'Handle with care',
    service_code: 'GROUND',
    ordered_at: '2024-03-01T00:00:00Z',
    shipped_at: null,
    delivered_at: null,
    cancelled_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('networkon transformOrder', () => {
  it('maps id from raw.id as string', () => {
    expect(transformOrder(makeOrder()).id).toBe('order-001')
  })

  it('maps numeric id to string', () => {
    expect(transformOrder(makeOrder({ id: 999 })).id).toBe('999')
  })

  it('maps status pending → PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps status shipped → SHIPPED', () => {
    expect(transformOrder(makeOrder({ status: 'shipped' })).status).toBe('SHIPPED')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status completed → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps status returned → RETURNED', () => {
    expect(transformOrder(makeOrder({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('maps unknown status → unknown', () => {
    expect(transformOrder(makeOrder({ status: 'mystery_status' })).status).toBe('unknown')
  })

  it('maps orderNumber from order_number', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORD-2024-001')
  })

  it('falls back orderNumber to id when order_number is null', () => {
    const result = transformOrder(makeOrder({ order_number: null }))
    expect(result.orderNumber).toBe('order-001')
  })

  it('maps customerId from customer_id as string', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('cust-42')
  })

  it('maps numeric customerId to string', () => {
    expect(transformOrder(makeOrder({ customer_id: 42 })).customerId).toBe('42')
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('maps totalAmount from total', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(3650)
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Handle with care')
  })

  it('maps requestedServiceCode from service_code', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('GROUND')
  })

  it('maps lineItems from items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-001')
    expect(result.lineItems![0].quantity).toBe(3)
    expect(result.lineItems![0].unitAmount).toBe(1000)
  })

  it('maps originAddress from origin', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.city).toBe('Origin City')
  })

  it('maps destinationAddress from destination', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Dest City')
  })

  it('maps createdAt and updatedAt as Dates', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
