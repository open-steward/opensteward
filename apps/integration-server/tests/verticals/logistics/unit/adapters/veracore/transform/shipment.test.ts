import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type VeraCoreShipment,
} from '../../../../../../../src/verticals/logistics/adapters/veracore/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<VeraCoreShipment> = {}): VeraCoreShipment {
  return {
    ShipmentID: 'VCS-2024-001',
    TrackingNumber: 'TRK123456789',
    Status: 'In Transit',
    CarrierCode: 'UPS',
    CarrierName: 'United Parcel Service',
    ServiceCode: 'UPS_GROUND',
    ServiceName: 'UPS Ground',
    WarehouseID: 'WH-7',
    Weight: 3.5,
    WeightUnit: 'lb',
    ShipFromAddress: {
      name: 'VeraCore Warehouse',
      street1: '200 Fulfillment Blvd',
      city: 'Memphis',
      state: 'TN',
      postalCode: '38101',
      country: 'US',
    },
    ShipToAddress: {
      name: 'Alice Smith',
      street1: '100 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    LabelUrl: 'https://labels.veracore.com/VCS-2024-001.pdf',
    Reference: 'ORD-1001',
    OrderID: 'VCO-2024-001',
    EstimatedDeliveryDate: '2024-03-04T00:00:00Z',
    ActualDeliveryDate: null,
    ShipDate: '2024-03-01T00:00:00Z',
    CreatedDate: '2024-03-01T00:00:00Z',
    ModifiedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (veracore)', () => {
  it('maps id from ShipmentID as string', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('VCS-2024-001')
  })

  it('maps trackingNumber from TrackingNumber', () => {
    const result = transformShipment(makeShipment())
    expect(result.trackingNumber).toBe('TRK123456789')
  })

  it('maps carrierId from CarrierCode', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('UPS')
  })

  it('falls back carrierId to CarrierName when CarrierCode is absent', () => {
    const result = transformShipment(makeShipment({ CarrierCode: null }))
    expect(result.carrierId).toBe('United Parcel Service')
  })

  it('falls back carrierId to "veracore" when both CarrierCode and CarrierName are absent', () => {
    const result = transformShipment(makeShipment({ CarrierCode: null, CarrierName: null }))
    expect(result.carrierId).toBe('veracore')
  })

  it('maps serviceCode from ServiceCode', () => {
    const result = transformShipment(makeShipment())
    expect(result.serviceCode).toBe('UPS_GROUND')
  })

  it('maps status "In Transit" to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment({ Status: 'In Transit' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps status "Label Created" to LABEL_CREATED', () => {
    const result = transformShipment(makeShipment({ Status: 'Label Created' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('maps status "Delivered" to DELIVERED', () => {
    const result = transformShipment(makeShipment({ Status: 'Delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps status "Out for Delivery" to OUT_FOR_DELIVERY', () => {
    const result = transformShipment(makeShipment({ Status: 'Out for Delivery' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status "Returned" to RETURNED', () => {
    const result = transformShipment(makeShipment({ Status: 'Returned' }))
    expect(result.status).toBe('RETURNED')
  })

  it('maps status "Voided" to CANCELLED', () => {
    const result = transformShipment(makeShipment({ Status: 'Voided' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps warehouseId from WarehouseID', () => {
    const result = transformShipment(makeShipment())
    expect(result.warehouseId).toBe('WH-7')
  })

  it('maps totalWeight with unit from WeightUnit', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(3.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps labelUrl from LabelUrl', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://labels.veracore.com/VCS-2024-001.pdf')
  })

  it('maps reference from Reference', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('ORD-1001')
  })

  it('falls back reference to OrderID string when Reference is absent', () => {
    const result = transformShipment(makeShipment({ Reference: null }))
    expect(result.reference).toBe('VCO-2024-001')
  })

  it('maps estimatedDeliveryAt as a Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from ShipDate', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps destinationAddress from ShipToAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Alice Smith')
    expect(result.destinationAddress?.city).toBe('Austin')
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
