import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformParcelStoryShipment,
  type BoxberryShipment,
  type BoxberryParcelStoryItem,
} from '../../../../../../../src/verticals/logistics/adapters/boxberry/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<BoxberryShipment> = {}): BoxberryShipment {
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
    label: 'https://api.boxberry.ru/label/BBX123456789.pdf',
    barcode: 'BBX123456789',
    ...overrides,
  }
}

describe('transformShipment (boxberry)', () => {
  it('maps id from order_id', () => {
    expect(transformShipment(makeShipment()).id).toBe('ORDER-001')
  })

  it('maps trackingNumber from track', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('BBX123456789')
  })

  it('sets carrierId to boxberry', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('boxberry')
  })

  it('maps status "3" (transit) → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: '3' })).status).toBe('IN_TRANSIT')
  })

  it('maps status "5" (delivered) → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: '5' })).status).toBe('DELIVERED')
  })

  it('maps status "7" (cancel) → CANCELLED', () => {
    expect(transformShipment(makeShipment({ status: '7' })).status).toBe('CANCELLED')
  })

  it('maps status "1" (created) → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: '1' })).status).toBe('LABEL_CREATED')
  })

  it('maps weight to totalWeight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps delivery_sum to cost.amount with RUB currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(120)
    expect(result.cost?.currency).toBe('RUB')
  })

  it('maps destinationAddress from customer', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Ivan Petrov')
    expect(result.destinationAddress?.city).toBe('Moscow')
    expect(result.destinationAddress?.postalCode).toBe('107045')
  })

  it('maps labelUrl from label', () => {
    expect(transformShipment(makeShipment()).labelUrl).toContain('BBX123456789.pdf')
  })

  it('maps createdAt from date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(
      makeShipment({
        order_id: null,
        status: null,
        weight: null,
        delivery_sum: null,
        price: null,
        customer: null,
        label: null,
        date: null,
      }),
    )
    expect(result.totalWeight).toBeUndefined()
    expect(result.cost).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})

/**
 * The documented ParselStory example row, field by field:
 * https://yandex.ru/support/delivery-boxberry/ru/pages/parcel-story
 */
function parcelStoryRow(overrides: Partial<BoxberryParcelStoryItem> = {}): BoxberryParcelStoryItem {
  return {
    track: 'AAP103449258',
    label:
      'http://api.boxberry.ru/parcel-files/barcodes?parcel_id=103449258&token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    date: '2020.05.05 18:54:56',
    send: false,
    barcode: '0000309670026',
    imid: '1533187444',
    ...overrides,
  }
}

describe('transformParcelStoryShipment (boxberry)', () => {
  it('maps the documented ParselStory row and parses against ShipmentSchema', () => {
    const out = ShipmentSchema.parse(transformParcelStoryShipment(parcelStoryRow()))
    expect(out.id).toBe('AAP103449258')
    expect(out.trackingNumber).toBe('AAP103449258')
    expect(out.carrierId).toBe('boxberry')
    expect(out.reference).toBe('1533187444')
    expect(out.labelUrl).toBe(
      'http://api.boxberry.ru/parcel-files/barcodes?parcel_id=103449258&token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    )
  })

  it('sets no status, cost or createdAt: the row documents none (date has no zone)', () => {
    const out = transformParcelStoryShipment(parcelStoryRow())
    expect(out.status).toBeUndefined()
    expect(out.cost).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
    expect(out.metadata?.date).toBe('2020.05.05 18:54:56')
  })

  it('drops a label that is not an absolute URL', () => {
    const out = ShipmentSchema.parse(transformParcelStoryShipment(parcelStoryRow({ label: '' })))
    expect(out.labelUrl).toBeUndefined()
  })
})
