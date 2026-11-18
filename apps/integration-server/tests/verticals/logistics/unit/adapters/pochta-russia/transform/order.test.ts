/**
 * Fixture fields are the ones the Otpravka specification documents for a
 * заказ in a партия, returned by GET /1.0/batch/{name}/shipment ("Запрос данных
 * о заказах в партии") and GET /1.0/shipment/{id} ("Поиск заказа в партии по
 * внутреннему id"):
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type PochtaRussiaOrder,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

const DOC_ORDER: PochtaRussiaOrder = {
  id: 204815,
  barcode: '80083273150426',
  'batch-name': '17',
  'mail-type': 'POSTAL_PARCEL',
  mass: 1250,
  'order-num': 'SHOP-1042',
  'last-oper-type': 'GIVING',
  'total-rate-wo-vat': 30000,
  'total-vat': 6000,
  'recipient-name': 'Иванов Иван Иванович',
  'index-to': 101000,
  'place-to': 'Москва',
  'region-to': 'Москва',
  'street-to': 'Мясницкая',
  'house-to': '26',
  'room-to': '5',
  'sender-name': 'ООО Ромашка',
  'index-from': '630000',
  'place-from': 'Новосибирск',
  'region-from': 'Новосибирская область',
  'street-from': 'Ленина',
  'house-from': '1',
}

describe('pochta-russia transformOrder (documented заказ fields)', () => {
  it('maps the documented record and parses against OrderSchema', () => {
    const o = OrderSchema.parse(transformOrder(DOC_ORDER))
    expect(o).toEqual({
      id: '204815',
      status: 'DELIVERED',
      orderNumber: 'SHOP-1042',
      shipmentIds: ['204815'],
      destinationAddress: {
        name: 'Иванов Иван Иванович',
        street1: 'Мясницкая, 26, 5',
        city: 'Москва',
        state: 'Москва',
        postalCode: '101000',
      },
      originAddress: {
        name: 'ООО Ромашка',
        street1: 'Ленина, 1',
        city: 'Новосибирск',
        state: 'Новосибирская область',
        postalCode: '630000',
      },
      metadata: DOC_ORDER,
    })
  })

  it('maps documented last-oper-type values and falls back to lowercase unknown', () => {
    const status = (t: string | undefined) => transformOrder({ id: 1, 'last-oper-type': t }).status
    expect(status('ACCEPTING')).toBe('SHIPPED')
    expect(status('PROCESSING')).toBe('SHIPPED')
    expect(status('GIVING')).toBe('DELIVERED')
    expect(status('RETURNING')).toBe('RETURNED')
    expect(status('CANCELLATION')).toBe('CANCELLED')
    expect(status('TRYING')).toBe('unknown')
    expect(status('STORING')).toBe('unknown')
    expect(status('UNKNOWN')).toBe('unknown')
    expect(status(undefined)).toBe('unknown')
  })

  it('orderNumber is the documented order-num only, never the barcode', () => {
    expect(transformOrder({ id: 1, barcode: '80083273150426' }).orderNumber).toBeUndefined()
  })

  it('a minimal record still parses, with no invented fields', () => {
    const o = OrderSchema.parse(transformOrder({ id: 7 }))
    expect(o).toEqual({ id: '7', status: 'unknown', shipmentIds: ['7'], metadata: { id: 7 } })
  })

  it('a record without id has no shipmentIds', () => {
    const o = OrderSchema.parse(transformOrder({ 'order-num': 'X' }))
    expect(o.id).toBeUndefined()
    expect(o.shipmentIds).toBeUndefined()
  })
})
