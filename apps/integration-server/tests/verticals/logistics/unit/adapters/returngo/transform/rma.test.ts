import { describe, it, expect } from 'vitest'
import {
  transformRmaToShipment,
  transformRmaToOrder,
  type ReturnGoRma,
} from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/rma'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<ReturnGoRma> = {}): ReturnGoRma {
  return {
    id: 'rma-001',
    rma_number: 'RMA-001',
    status: 'pending',
    return_status: 'pending',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    order_id: 'ord-100',
    order_name: '#1001',
    order_number: '1001',
    customer_address: {
      full_name: 'Jane Customer',
      address1: '1 Customer Rd',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'US',
    },
    return_address: {
      full_name: 'Merchant Returns',
      address1: '5 Warehouse Dr',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      country: 'US',
    },
    shipment: {
      tracking_number: 'TRK-RG-001',
      carrier: 'USPS',
      service: 'USPS_PRIORITY',
      label_url: 'https://labels.returngo.example/rma-001.pdf',
      label_cost: 8.5,
      status: 'pending',
    },
    tracking_number: 'TRK-RG-001',
    carrier: 'USPS',
    label_url: 'https://labels.returngo.example/rma-001.pdf',
    currency: 'USD',
    refund_amount: 50.0,
    total_amount: 50.0,
    subtotal_amount: 45.0,
    tax_amount: 5.0,
    shipping_amount: 0,
    items: [
      {
        id: 'li-001',
        title: 'Blue Widget',
        sku: 'BW-001',
        quantity: 2,
        price: 25.0,
      },
    ],
    ...overrides,
  }
}

// ─── transformRmaToShipment ───────────────────────────────────────────────────

describe('ReturnGO transformRmaToShipment', () => {
  it('maps id as string', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.id).toBe('rma-001')
  })

  it('maps tracking number and carrier', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.trackingNumber).toBe('TRK-RG-001')
    expect(result.carrierId).toBe('USPS')
  })

  it('maps service code from shipment.service', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.serviceCode).toBe('USPS_PRIORITY')
  })

  it('maps label_url', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.labelUrl).toBe('https://labels.returngo.example/rma-001.pdf')
  })

  it('maps cost from label_cost and currency', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.cost?.amount).toBe(850)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps origin and destination addresses', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.originAddress?.city).toBe('New York')
    expect(result.destinationAddress?.city).toBe('Chicago')
  })

  it('maps reference from order_name', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.reference).toBe('#1001')
  })

  it('maps pending status to PENDING', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.status).toBe('PENDING')
  })

  it('maps transit status to IN_TRANSIT', () => {
    const result = transformRmaToShipment(
      makeRaw({ shipment: { status: 'in_transit', tracking_number: 'T1', carrier: 'USPS' } }),
    )
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps received/complete to DELIVERED', () => {
    const result = transformRmaToShipment(makeRaw({ shipment: { status: 'received' } }))
    expect(result.status).toBe('DELIVERED')
  })

  it('parses date fields to Date instances', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse when cost is present', () => {
    const result = transformRmaToShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes ShipmentSchema.parse when no label cost is present', () => {
    const result = transformRmaToShipment(
      makeRaw({ shipment: { label_cost: undefined }, currency: null }),
    )
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

// ─── transformRmaToOrder ──────────────────────────────────────────────────────

describe('ReturnGO transformRmaToOrder', () => {
  it('maps id as string', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.id).toBe('rma-001')
  })

  it('maps orderNumber from order_number', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.orderNumber).toBe('1001')
  })

  it('maps financial fields', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.currency).toBe('USD')
    expect(result.subtotalAmount).toBe(45.0)
    expect(result.taxAmount).toBe(5.0)
    expect(result.totalAmount).toBe(50.0)
  })

  it('maps line items', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].name).toBe('Blue Widget')
    expect(result.lineItems![0].sku).toBe('BW-001')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(2500)
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('maps origin and destination addresses', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.originAddress?.city).toBe('New York')
    expect(result.destinationAddress?.city).toBe('Chicago')
  })

  it('maps pending status to PENDING', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.status).toBe('PENDING')
  })

  it('falls back to line_items when items is absent', () => {
    const result = transformRmaToOrder(
      makeRaw({
        items: undefined,
        line_items: [{ id: 'x', title: 'Gadget', quantity: 1, price: 10 }],
      }),
    )
    expect(result.lineItems).toHaveLength(1)
  })

  it('parses date fields to Date instances', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformRmaToOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
