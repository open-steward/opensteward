import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type CargowiseOrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/cargowise/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<CargowiseOrderResponse> = {}): CargowiseOrderResponse {
  return {
    orderId: 'CW-ORD-001',
    orderNumber: 'ORD-2024-001',
    status: 'SHIPPED',
    customerId: 'cust-42',
    warehouseId: 'WH-FRA',
    shipmentIds: ['CW-SHP-001', 'CW-SHP-002'],
    origin: {
      name: 'Alice Sender',
      company: 'Acme Exports',
      street: '10 Cargo Drive',
      city: 'Frankfurt',
      state: 'HE',
      postCode: '60549',
      country: 'DE',
    },
    destination: {
      name: 'Bob Receiver',
      company: 'Import Corp',
      street: '200 Airport Blvd',
      city: 'Chicago',
      state: 'IL',
      postCode: '60666',
      country: 'US',
    },
    lineItems: [
      {
        lineId: 'li-001',
        sku: 'SKU-XYZ',
        description: 'Widget A',
        quantity: 10,
        unitPrice: 19.99,
        totalPrice: 199.9,
        currency: 'USD',
      },
    ],
    currency: 'USD',
    subtotal: 199.9,
    taxAmount: 16.0,
    shippingAmount: 25.0,
    discountAmount: 0,
    total: 240.9,
    notes: 'Rush order',
    requestedServiceCode: 'AIR_EXPRESS',
    orderDate: '2024-03-01T00:00:00Z',
    shippedDate: '2024-03-02T00:00:00Z',
    // In transit: CargoWise omits deliveredDate / cancelledDate until they occur.
    createdDate: '2024-03-01T00:00:00Z',
    lastUpdatedDate: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (cargowise)', () => {
  it('maps id from orderId', () => {
    expect(transformOrder(makeOrder()).id).toBe('CW-ORD-001')
  })

  it('maps orderNumber', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORD-2024-001')
  })

  it('maps status SHIPPED → SHIPPED', () => {
    expect(transformOrder(makeOrder()).status).toBe('SHIPPED')
  })

  it('maps status DELIVERED → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps status CANCELLED → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps status PENDING → PENDING', () => {
    expect(transformOrder(makeOrder({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps unknown status → undefined', () => {
    expect(transformOrder(makeOrder({ status: 'MYSTERY' })).status).toBeUndefined()
  })

  it('maps customerId', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('cust-42')
  })

  it('maps warehouseId', () => {
    expect(transformOrder(makeOrder()).warehouseId).toBe('WH-FRA')
  })

  it('maps shipmentIds', () => {
    expect(transformOrder(makeOrder()).shipmentIds).toEqual(['CW-SHP-001', 'CW-SHP-002'])
  })

  it('maps originAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Frankfurt')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('maps destinationAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.postalCode).toBe('60666')
  })

  it('converts subtotal to integer minor-units', () => {
    // 199.9 * 100 = 19990
    expect(transformOrder(makeOrder()).subtotalAmount).toBe(19990)
  })

  it('converts total to integer minor-units', () => {
    // 240.9 * 100 = 24090
    expect(transformOrder(makeOrder()).totalAmount).toBe(24090)
  })

  it('converts shippingAmount to integer minor-units', () => {
    // 25.0 * 100 = 2500
    expect(transformOrder(makeOrder()).shippingAmount).toBe(2500)
  })

  it('maps lineItems with unit/total amounts in minor-units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].sku).toBe('SKU-XYZ')
    expect(result.lineItems![0].quantity).toBe(10)
    // unitPrice 19.99 * 100 = 1999
    expect(result.lineItems![0].unitAmount).toBe(1999)
    // totalPrice 199.9 * 100 = 19990
    expect(result.lineItems![0].totalAmount).toBe(19990)
  })

  it('maps currency', () => {
    expect(transformOrder(makeOrder()).currency).toBe('USD')
  })

  it('maps notes', () => {
    expect(transformOrder(makeOrder()).notes).toBe('Rush order')
  })

  it('maps requestedServiceCode', () => {
    expect(transformOrder(makeOrder()).requestedServiceCode).toBe('AIR_EXPRESS')
  })

  it('maps orderAt, shippedAt, createdAt, updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.shippedAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformOrder(
      makeOrder({
        status: undefined,
        origin: undefined,
        destination: undefined,
        lineItems: [],
        subtotal: undefined,
        total: undefined,
        shipmentIds: [],
      }),
    )
    expect(result.status).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.lineItems).toBeUndefined()
    expect(result.subtotalAmount).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})
