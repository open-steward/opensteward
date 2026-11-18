/**
 * Fixture fields are the ones the Otpravka specification documents for an
 * отправление returned by GET /1.0/batch/{name}/shipment and GET /1.0/shipment/{id}:
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 */
import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type PochtaRussiaShipment,
} from '../../../../../../../src/verticals/logistics/adapters/pochta-russia/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

const DOC_SHIPMENT: PochtaRussiaShipment = {
  id: 204815,
  barcode: '80083273150426',
  'batch-name': '17',
  'mail-type': 'POSTAL_PARCEL',
  mass: 1250,
  dimension: { height: 10, length: 30, width: 20 },
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

describe('pochta-russia transformShipment (documented отправление fields)', () => {
  it('maps the documented record and parses against ShipmentSchema', () => {
    const s = ShipmentSchema.parse(transformShipment(DOC_SHIPMENT))
    expect(s).toMatchObject({
      id: '204815',
      status: 'DELIVERED',
      trackingNumber: '80083273150426',
      carrierId: 'pochta-russia',
      serviceCode: 'POSTAL_PARCEL',
      totalWeight: { value: 1250, unit: 'g' },
      dimensions: { length: 30, width: 20, height: 10, unit: 'cm' },
      cost: { amount: 36000, currency: 'RUB' },
      reference: 'SHOP-1042',
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
    })
    expect(s.metadata).toEqual(DOC_SHIPMENT)
  })

  it('sets no country: mail-direct is a numeric code, not ISO alpha-2', () => {
    const s = transformShipment({ ...DOC_SHIPMENT, 'mail-direct': 643 } as PochtaRussiaShipment)
    expect(s.destinationAddress?.country).toBeUndefined()
    expect(s.originAddress?.country).toBeUndefined()
  })

  it('maps documented last-oper-type values and falls back to UNKNOWN', () => {
    const status = (t: string | undefined) =>
      transformShipment({ id: 1, 'last-oper-type': t }).status
    expect(status('ACCEPTING')).toBe('IN_TRANSIT')
    expect(status('PROCESSING')).toBe('IN_TRANSIT')
    expect(status('GIVING')).toBe('DELIVERED')
    expect(status('RETURNING')).toBe('RETURNED')
    expect(status('TRYING')).toBe('EXCEPTION')
    expect(status('SKIPPING')).toBe('EXCEPTION')
    expect(status('LOSS_REGISTRATION')).toBe('EXCEPTION')
    expect(status('CANCELLATION')).toBe('CANCELLED')
    expect(status('STORING')).toBe('UNKNOWN')
    expect(status('UNKNOWN')).toBe('UNKNOWN')
    expect(status(undefined)).toBe('UNKNOWN')
  })

  it('omits cost unless both documented kopeck totals are present', () => {
    expect(transformShipment({ id: 1, 'total-rate-wo-vat': 30000 }).cost).toBeUndefined()
    expect(transformShipment({ id: 1, 'total-vat': 6000 }).cost).toBeUndefined()
  })

  it('a minimal record still parses, with no invented fields', () => {
    const s = ShipmentSchema.parse(transformShipment({ id: 7 }))
    expect(s).toEqual({
      id: '7',
      status: 'UNKNOWN',
      carrierId: 'pochta-russia',
      metadata: { id: 7 },
    })
  })
})
