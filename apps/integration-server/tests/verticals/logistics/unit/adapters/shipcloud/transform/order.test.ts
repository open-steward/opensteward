import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type ShipcloudOrder,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<ShipcloudOrder> = {}): ShipcloudOrder {
  return {
    id: 'sc-ord-001',
    external_order_id: 'EXT-001',
    external_customer_id: 'CUST-001',
    placed_at: '2024-03-01T00:00:00Z',
    total_price: 4999,
    total_vat: 799,
    currency: 'EUR',
    delivery_address: {
      first_name: 'Jane',
      last_name: 'Doe',
      street: 'Hauptstraße',
      street_no: '5',
      city: 'Munich',
      zip_code: '80333',
      country: 'DE',
      email: 'jane.doe@acme.example',
    },
    order_line_items: [
      {
        id: 'li-001',
        sku: 'SKU-A',
        title: { en: 'Widget', de: 'Widget DE' },
        quantity: 2,
        price: 2000,
        currency: 'EUR',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (shipcloud)', () => {
  it('maps id from order id', () => {
    expect(transformOrder(makeOrder()).id).toBe('sc-ord-001')
  })

  it('maps orderNumber from external_order_id', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('EXT-001')
  })

  it('maps customerId from external_customer_id', () => {
    expect(transformOrder(makeOrder()).customerId).toBe('CUST-001')
  })

  it('status is always PENDING (shipcloud orders have no status field)', () => {
    expect(transformOrder(makeOrder()).status).toBe('PENDING')
  })

  it('maps totalAmount from total_price', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(4999)
  })

  it('maps taxAmount from total_vat', () => {
    expect(transformOrder(makeOrder()).taxAmount).toBe(799)
  })

  it('maps currency from currency field', () => {
    expect(transformOrder(makeOrder()).currency).toBe('EUR')
  })

  it('maps destinationAddress from delivery_address', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('Munich')
    expect(result.destinationAddress?.country).toBe('DE')
  })

  it('maps orderAt as Date from placed_at', () => {
    expect(transformOrder(makeOrder()).orderAt).toBeInstanceOf(Date)
  })

  it('maps lineItems with correct fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('li-001')
    expect(result.lineItems![0].sku).toBe('SKU-A')
    expect(result.lineItems![0].name).toBe('Widget')
    expect(result.lineItems![0].quantity).toBe(2)
    expect(result.lineItems![0].unitAmount).toBe(2000)
  })

  it('extracts English locale from localised title', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].name).toBe('Widget')
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('omits lineItems when none provided', () => {
    expect(transformOrder(makeOrder({ order_line_items: [] })).lineItems).toBeUndefined()
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
