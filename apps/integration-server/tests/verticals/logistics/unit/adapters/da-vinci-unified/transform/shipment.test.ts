import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type DaVinciShipment,
} from '../../../../../../../src/verticals/logistics/adapters/da-vinci-unified/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(o: Partial<DaVinciShipment> = {}): DaVinciShipment {
  return {
    ShipmentId: 301,
    TrackingNumber: 'TRACK-ABC123',
    Status: 'InTransit',
    CarrierCode: 'FEDEX',
    ServiceCode: 'FEDEX_GROUND',
    Weight: 2.5,
    WeightUOM: 'lb',
    WarehouseId: 10,
    ShipFromAddress: {
      name: 'Warehouse',
      address1: '100 Industrial Blvd',
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
      country: 'US',
    },
    ShipToAddress: {
      name: 'Customer',
      address1: '200 Oak Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    LabelURL: 'https://labels.example.com/label.pdf',
    Reference: 'ORD-999',
    EstimatedDeliveryDate: '2024-03-05T00:00:00Z',
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-02T00:00:00Z',
    ...o,
  }
}

describe('da-vinci-unified transformShipment', () => {
  it('maps ShipmentId to string id', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('301')
  })

  it('uses ShipmentKey as id when ShipmentId is null', () => {
    const result = transformShipment(makeShipment({ ShipmentId: null, ShipmentKey: 'KEY-301' }))
    expect(result.id).toBe('KEY-301')
  })

  it('maps TrackingNumber', () => {
    const result = transformShipment(makeShipment())
    expect(result.trackingNumber).toBe('TRACK-ABC123')
  })

  it('maps InTransit status to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps LabelCreated status to LABEL_CREATED', () => {
    const result = transformShipment(makeShipment({ Status: 'LabelCreated' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps Delivered status to DELIVERED', () => {
    const result = transformShipment(makeShipment({ Status: 'Delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps OutForDelivery status to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makeShipment({ Status: 'OutForDelivery' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Cancelled status to CANCELLED', () => {
    const result = transformShipment(makeShipment({ Status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps Exception status to EXCEPTION', () => {
    const result = transformShipment(makeShipment({ Status: 'Exception' }))
    expect(result.status).toBe('EXCEPTION')
  })

  it('maps CarrierCode to carrierId', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('FEDEX')
  })

  it('defaults carrierId to da-vinci-unified when CarrierCode is null', () => {
    const result = transformShipment(makeShipment({ CarrierCode: null }))
    expect(result.carrierId).toBe('da-vinci-unified')
  })

  it('maps ServiceCode to serviceCode', () => {
    const result = transformShipment(makeShipment())
    expect(result.serviceCode).toBe('FEDEX_GROUND')
  })

  it('maps WarehouseId to string warehouseId', () => {
    const result = transformShipment(makeShipment())
    expect(result.warehouseId).toBe('10')
  })

  it('maps Weight with lb unit', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps LabelURL to labelUrl', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://labels.example.com/label.pdf')
  })

  it('maps Reference to reference', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('ORD-999')
  })

  it('maps ship-to address city', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.city).toBe('Austin')
  })

  it('maps ship-from address city', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Dallas')
  })

  it('maps EstimatedDeliveryDate to estimatedDeliveryAt', () => {
    const result = transformShipment(makeShipment())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps CreatedDate to createdAt', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes ShipmentSchema validation with minimal input', () => {
    const result = transformShipment({})
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
