import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  transformParcelStoryOrder,
  type BoxberryOrderRaw,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeOrder(overrides: Partial<BoxberryOrderRaw> = {}): BoxberryOrderRaw {
  return {
    track: 'BBX123456789',
    order_id: 'ORDER-001',
    status: '3',
    status_name: 'В транзите',
    weight: '1.5',
    price: '150.00',
    delivery_sum: '120.00',
    payment_sum: '150.00',
    date: '2024-03-01T00:00:00Z',
    date_start: '2024-03-01T00:00:00Z',
    date_end: '2024-03-05T00:00:00Z',
    customer: {
      FIO: 'Ivan Petrov',
      Phone: '+79161234567',
      Email: 'ivan@example.com',
      Address: 'ul. Lenina 1, kv. 10',
      PostalCode: '107045',
      City: 'Moscow',
    },
    ...overrides,
  }
}

describe('transformOrder (boxberry)', () => {
  it('maps id from order_id', () => {
    expect(transformOrder(makeOrder()).id).toBe('ORDER-001')
  })

  it('maps orderNumber from order_id', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBe('ORDER-001')
  })

  it('maps status "3" (transit) → AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeOrder({ status: '3' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps status "5" (delivered) → DELIVERED', () => {
    expect(transformOrder(makeOrder({ status: '5' })).status).toBe('DELIVERED')
  })

  it('maps status "1" (created) → PENDING', () => {
    expect(transformOrder(makeOrder({ status: '1' })).status).toBe('PENDING')
  })

  it('maps status "7" (cancel) → CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: '7' })).status).toBe('CANCELLED')
  })

  it('sets currency to RUB', () => {
    expect(transformOrder(makeOrder()).currency).toBe('RUB')
  })

  it('converts payment_sum to integer minor-units for totalAmount', () => {
    // payment_sum = '150.00' → 150 * 100 = 15000
    expect(transformOrder(makeOrder()).totalAmount).toBe(15000)
  })

  it('converts delivery_sum to integer minor-units for shippingAmount', () => {
    // delivery_sum = '120.00' → 120 * 100 = 12000
    expect(transformOrder(makeOrder()).shippingAmount).toBe(12000)
  })

  it('maps destinationAddress from customer', () => {
    const result = transformOrder(makeOrder())
    expect(result.destinationAddress?.name).toBe('Ivan Petrov')
    expect(result.destinationAddress?.city).toBe('Moscow')
  })

  it('includes tracking number in shipmentIds', () => {
    const result = transformOrder(makeOrder())
    expect(result.shipmentIds).toContain('BBX123456789')
  })

  it('maps createdAt from date', () => {
    expect(transformOrder(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOrder()))).not.toThrow()
  })
})

describe('transformParcelStoryOrder (boxberry)', () => {
  // The documented ParselStory example row:
  // https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
  const row = {
    track: 'AAP103449258',
    label:
      'http://api.boxberry.ru/parcel-files/barcodes?parcel_id=103449258&token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    date: '2020.05.05 18:54:56',
    send: false,
    barcode: '0000309670026',
    imid: '1533187444',
  }

  it('maps track to id and shipmentIds, imid to orderNumber, and parses', () => {
    const out = OrderSchema.parse(transformParcelStoryOrder(row))
    expect(out.id).toBe('AAP103449258')
    expect(out.orderNumber).toBe('1533187444')
    expect(out.shipmentIds).toEqual(['AAP103449258'])
  })

  it('sets no status, amounts, currency or createdAt: the row documents none', () => {
    const out = transformParcelStoryOrder(row)
    expect(out.status).toBeUndefined()
    expect(out.currency).toBeUndefined()
    expect(out.totalAmount).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
  })
})
