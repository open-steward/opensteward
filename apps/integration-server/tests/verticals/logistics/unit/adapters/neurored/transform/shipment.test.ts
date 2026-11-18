import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type NeuroredShipmentRecord,
} from '../../../../../../../src/verticals/logistics/adapters/neurored/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<NeuroredShipmentRecord> = {}): NeuroredShipmentRecord {
  return {
    Id: 'a0B000001234567',
    Name: 'SHIP-0001',
    NR_TrackingNumber__c: 'NR-TRACK-001',
    NR_Status__c: 'In Transit',
    NR_ServiceType__c: 'Air Freight',
    NR_CarrierName__c: 'DHL',
    NR_Mode__c: 'AIR',
    NR_TotalWeight__c: 10,
    NR_WeightUnit__c: 'kg',
    NR_EstimatedDelivery__c: '2024-03-05T00:00:00Z',
    NR_ActualDelivery__c: undefined,
    NR_LabelUrl__c: 'https://example.com/label.pdf',
    NR_Reference__c: 'REF-2024-001',
    NR_Notes__c: 'Handle with care',
    NR_OriginName__c: 'Alice',
    NR_OriginCompany__c: 'Sender Corp',
    NR_OriginStreet__c: '1 Sender St',
    NR_OriginCity__c: 'New York',
    NR_OriginState__c: 'NY',
    NR_OriginPostalCode__c: '10001',
    NR_OriginCountry__c: 'US',
    NR_OriginPhone__c: '+12125551234',
    NR_OriginEmail__c: 'sender@example.com',
    NR_DestName__c: 'Bob',
    NR_DestCompany__c: 'Receiver Corp',
    NR_DestStreet__c: '9 Receiver Rd',
    NR_DestCity__c: 'Los Angeles',
    NR_DestState__c: 'CA',
    NR_DestPostalCode__c: '90001',
    NR_DestCountry__c: 'US',
    NR_DestPhone__c: '+13105551234',
    NR_DestEmail__c: 'receiver@example.com',
    CreatedDate: '2024-03-01T00:00:00Z',
    LastModifiedDate: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('neurored transformShipment', () => {
  it('maps id from Id field', () => {
    expect(transformShipment(makeShipment()).id).toBe('a0B000001234567')
  })

  it('maps trackingNumber from NR_TrackingNumber__c', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('NR-TRACK-001')
  })

  it('maps carrierId from NR_CarrierName__c', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('DHL')
  })

  it('defaults carrierId to "neurored" when NR_CarrierName__c is absent', () => {
    const result = transformShipment(makeShipment({ NR_CarrierName__c: undefined }))
    expect(result.carrierId).toBe('neurored')
  })

  it('maps serviceCode from NR_ServiceType__c', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('Air Freight')
  })

  it('maps status "In Transit" → IN_TRANSIT (via SHIPMENT_STATUS_MAP)', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status "Delivered" → DELIVERED', () => {
    expect(transformShipment(makeShipment({ NR_Status__c: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps status "Planned" → PENDING', () => {
    expect(transformShipment(makeShipment({ NR_Status__c: 'Planned' })).status).toBe('PENDING')
  })

  it('maps status "Booked" → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ NR_Status__c: 'Booked' })).status).toBe('LABEL_CREATED')
  })

  it('maps status "Cancelled" → CANCELLED', () => {
    expect(transformShipment(makeShipment({ NR_Status__c: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ NR_Status__c: 'Mystery' })).status).toBe('UNKNOWN')
  })

  it('maps origin address from NR_Origin*__c fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice')
    expect(result.originAddress?.city).toBe('New York')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address from NR_Dest*__c fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps totalWeight with unit "kg"', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(10)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps weight unit "lbs" to "lb"', () => {
    const result = transformShipment(makeShipment({ NR_WeightUnit__c: 'lbs' }))
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps weight unit "g" to "g"', () => {
    const result = transformShipment(makeShipment({ NR_WeightUnit__c: 'g' }))
    expect(result.totalWeight?.unit).toBe('g')
  })

  it('maps labelUrl from NR_LabelUrl__c', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe('https://example.com/label.pdf')
  })

  it('maps reference from NR_Reference__c', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-2024-001')
  })

  it('maps notes from NR_Notes__c', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Handle with care')
  })

  it('maps createdAt from CreatedDate', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from LastModifiedDate', () => {
    expect(transformShipment(makeShipment()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
