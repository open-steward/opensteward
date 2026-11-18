import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type VamashipOrder,
} from '../../../../../../../src/verticals/logistics/adapters/vamaship/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<VamashipOrder> = {}): VamashipOrder {
  return {
    id: 777,
    order_number: 'ORD-2024-001',
    status: 'processing',
    consignee_name: 'Riya Sharma',
    consignee_email: 'riya@example.com',
    consignee_phone: '+919876543210',
    consignee_address1: '12 MG Road',
    consignee_address2: null,
    consignee_city: 'Bengaluru',
    consignee_state: 'KA',
    consignee_pincode: '560001',
    consignee_country: 'IN',
    shipper_name: 'ACME India',
    shipper_address1: '5 Industrial Estate',
    shipper_address2: null,
    shipper_city: 'Mumbai',
    shipper_state: 'MH',
    shipper_pincode: '400001',
    shipper_country: 'IN',
    items: [
      { id: 1, name: 'Widget', sku: 'WGT-001', quantity: 2, unit_price: 500, hsn_code: '8543' },
    ],
    shipment_ids: [11, 22],
    payment_mode: 'prepaid',
    invoice_amount: 1000,
    shipping_charges: 50,
    total_amount: 1050,
    courier_name: 'Delhivery',
    awb_number: 'AWB001',
    warehouse_id: 3,
    order_date: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (vamaship)', () => {
  it('maps id to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('777')
  })

  it('maps orderNumber from order_number', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('ORD-2024-001')
  })

  it('maps status "processing" to PROCESSING', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.status).toBe('PROCESSING')
  })

  it('maps status "delivered" to DELIVERED', () => {
    const result = transformOrder(makeOrder({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps status "rto" to RETURNED', () => {
    const result = transformOrder(makeOrder({ status: 'rto' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps shipmentIds from shipment_ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toEqual(['11', '22'])
  })

  it('maps lineItems from items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('WGT-001')
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('hardcodes currency to INR', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('INR')
  })

  it('maps totalAmount from total_amount', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalAmount).toBe(1050)
  })

  it('maps destinationAddress from consignee fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Riya Sharma')
    expect(result.destinationAddress?.city).toBe('Bengaluru')
  })

  it('maps warehouseId from warehouse_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.warehouseId).toBe('3')
  })

  it('maps createdAt as a Date', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata through as raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
