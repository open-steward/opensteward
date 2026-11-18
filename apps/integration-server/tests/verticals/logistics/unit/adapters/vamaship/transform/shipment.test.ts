import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type VamashipShipment,
} from '../../../../../../../src/verticals/logistics/adapters/vamaship/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<VamashipShipment> = {}): VamashipShipment {
  return {
    id: 500,
    awb_number: 'AWB987654321',
    courier_name: 'Delhivery',
    courier_id: 5,
    status: 'in_transit',
    service_type: 'EXPRESS',
    pickup_address_id: 7,
    consignee_name: 'Riya Sharma',
    consignee_address1: '12 MG Road',
    consignee_address2: null,
    consignee_city: 'Bengaluru',
    consignee_state: 'KA',
    consignee_pincode: '560001',
    consignee_country: 'IN',
    consignee_phone: '+919876543210',
    consignee_email: 'riya@example.com',
    shipper_name: 'ACME India',
    shipper_address1: '5 Industrial Estate',
    shipper_address2: null,
    shipper_city: 'Mumbai',
    shipper_state: 'MH',
    shipper_pincode: '400001',
    shipper_country: 'IN',
    weight: 1.5,
    length: 30,
    breadth: 20,
    height: 10,
    estimated_delivery: '2024-03-04T00:00:00Z',
    delivered_at: null,
    label_url: 'https://labels.vamaship.com/500.pdf',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (vamaship)', () => {
  it('maps id to string', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('500')
  })

  it('maps trackingNumber from awb_number', () => {
    const result = transformShipment(makeShipment())
    expect(result.trackingNumber).toBe('AWB987654321')
  })

  it('maps carrierId from courier_name', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('Delhivery')
  })

  it('maps status "in_transit" to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment({ status: 'in_transit' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps status "delivered" to DELIVERED', () => {
    const result = transformShipment(makeShipment({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status "label_created" to LABEL_CREATED', () => {
    const result = transformShipment(makeShipment({ status: 'label_created' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps status "rto" to RETURNED', () => {
    const result = transformShipment(makeShipment({ status: 'rto' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps totalWeight from weight in kg', () => {
    const result = transformShipment(makeShipment({ weight: 2.0 }))
    expect(result.totalWeight?.value).toBe(2.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps labelUrl from label_url', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://labels.vamaship.com/500.pdf')
  })

  it('maps estimatedDeliveryAt as a Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps destinationAddress from consignee fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Riya Sharma')
    expect(result.destinationAddress?.city).toBe('Bengaluru')
  })

  it('passes metadata through as raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
