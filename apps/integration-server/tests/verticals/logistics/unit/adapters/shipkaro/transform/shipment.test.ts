import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShipKaroShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<ShipKaroShipment> = {}): ShipKaroShipment {
  return {
    id: 500,
    order_id: 999,
    awb_code: 'AWB-SKR-500',
    carrier_id: 10,
    courier_name: 'BlueDart',
    service_code: 'EXPRESS',
    status: 'IN_TRANSIT',
    weight: 2.5,
    length: 30,
    breadth: 20,
    height: 10,
    label_url: 'https://labels.example/500.pdf',
    etd: '2024-03-04T00:00:00Z',
    shipping_name: 'Ravi Kumar',
    shipping_address: '42 Gandhi Nagar',
    shipping_city: 'Mumbai',
    shipping_state: 'MH',
    shipping_pincode: '400001',
    shipping_country: 'IN',
    billing_name: 'Seller Co',
    billing_address: '1 Seller Road',
    billing_city: 'Delhi',
    billing_state: 'DL',
    billing_pincode: '110001',
    billing_country: 'IN',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment', () => {
  it('maps id as string from numeric id', () => {
    expect(transformShipment(makeRaw()).id).toBe('500')
  })

  it('maps trackingNumber from awb_code', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('AWB-SKR-500')
  })

  it('maps carrierId from courier_name', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('BlueDart')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('EXPRESS')
  })

  it('maps IN_TRANSIT status', () => {
    expect(transformShipment(makeRaw({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps LABEL_CREATED for PICKUP_SCHEDULED', () => {
    expect(transformShipment(makeRaw({ status: 'PICKUP_SCHEDULED' })).status).toBe('LABEL_CREATED')
  })

  it('maps RETURNED for RTO', () => {
    expect(transformShipment(makeRaw({ status: 'RTO' })).status).toBe('RETURNED')
  })

  it('maps EXCEPTION for LOST', () => {
    expect(transformShipment(makeRaw({ status: 'LOST' })).status).toBe('EXCEPTION')
  })

  it('maps totalWeight as kg', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeRaw()).labelUrl).toBe('https://labels.example/500.pdf')
  })

  it('maps estimatedDeliveryAt from etd', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toEqual(
      new Date('2024-03-04T00:00:00Z'),
    )
  })

  it('maps destinationAddress from shipping_ fields', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Mumbai')
    expect(result.destinationAddress?.postalCode).toBe('400001')
  })

  it('passes schema validation', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
