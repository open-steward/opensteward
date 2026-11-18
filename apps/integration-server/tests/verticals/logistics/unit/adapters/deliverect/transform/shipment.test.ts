import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type DeliverectDeliveryJob,
} from '../../../../../../../src/verticals/logistics/adapters/deliverect/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeJob(o: Partial<DeliverectDeliveryJob> = {}): DeliverectDeliveryJob {
  return {
    externalJobId: 'ext-job-001',
    jobId: 'job-ref-001',
    canDeliver: true,
    status: 'in_transit',
    price: 599,
    currency: 'USD',
    trackingUrl: 'https://tracking.deliverect.com/ext-job-001',
    pickupLocation: {
      address1: '100 Restaurant Row',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    deliveryLocations: [
      {
        name: 'Customer',
        address1: '200 Customer Lane',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60602',
        country: 'US',
      },
    ],
    ETAs: {
      pickupTime: '2024-03-01T10:00:00Z',
      deliveryTime: '2024-03-01T10:30:00Z',
    },
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T01:00:00Z',
    ...o,
  }
}

describe('deliverect transformShipment', () => {
  it('maps externalJobId to id', () => {
    const result = transformShipment(makeJob())
    expect(result.id).toBe('ext-job-001')
  })

  it('uses jobId as id when externalJobId is null', () => {
    const result = transformShipment(makeJob({ externalJobId: null }))
    expect(result.id).toBe('job-ref-001')
  })

  it('maps externalJobId to trackingNumber', () => {
    const result = transformShipment(makeJob())
    expect(result.trackingNumber).toBe('ext-job-001')
  })

  it('maps carrierId to deliverect', () => {
    const result = transformShipment(makeJob())
    expect(result.carrierId).toBe('deliverect')
  })

  it('maps serviceCode to deliverect_dispatch', () => {
    const result = transformShipment(makeJob())
    expect(result.serviceCode).toBe('deliverect_dispatch')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    const result = transformShipment(makeJob())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps created status to LABEL_CREATED', () => {
    const result = transformShipment(makeJob({ status: 'created' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps delivered status to DELIVERED', () => {
    const result = transformShipment(makeJob({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps out_for_delivery status to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makeJob({ status: 'out_for_delivery' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformShipment(makeJob({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps returned status to RETURNED', () => {
    const result = transformShipment(makeJob({ status: 'returned' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps trackingUrl to labelUrl', () => {
    const result = transformShipment(makeJob())
    expect(result.labelUrl).toBe('https://tracking.deliverect.com/ext-job-001')
  })

  it('maps price and currency to cost', () => {
    const result = transformShipment(makeJob())
    expect(result.cost).toEqual({ amount: 599, currency: 'USD' })
  })

  it('sets cost to undefined when price is null', () => {
    const result = transformShipment(makeJob({ price: null }))
    expect(result.cost).toBeUndefined()
  })

  it('maps jobId to reference', () => {
    const result = transformShipment(makeJob())
    expect(result.reference).toBe('job-ref-001')
  })

  it('maps first deliveryLocation as destinationAddress', () => {
    const result = transformShipment(makeJob())
    expect(result.destinationAddress?.city).toBe('Chicago')
  })

  it('sets destinationAddress to undefined when deliveryLocations is empty', () => {
    const result = transformShipment(makeJob({ deliveryLocations: [] }))
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps pickupLocation as originAddress', () => {
    const result = transformShipment(makeJob())
    expect(result.originAddress?.city).toBe('Chicago')
  })

  it('maps ETAs.deliveryTime to estimatedDeliveryAt', () => {
    const result = transformShipment(makeJob())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps created to createdAt', () => {
    const result = transformShipment(makeJob())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeJob())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes ShipmentSchema validation with minimal input', () => {
    const result = transformShipment({})
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
