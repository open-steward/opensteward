/**
 * Fixture: the first item of the documented 200 example of
 * GET /shipments/outboundShipments (https://auth.deposco.com/public/spec?version=latest),
 * trimmed to the fields the transform reads plus a few it must ignore.
 */
import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type DeposcoOutboundShipment,
} from '../../../../../../../src/verticals/logistics/adapters/deposco/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

const DOCUMENTED_SHIPMENT: DeposcoOutboundShipment = {
  self: {
    id: 1,
    businessKey: { number: 'OBShipment1', 'businessUnit.code': 'ABC' },
    href: 'https://api.deposco.com/latest/shipments/outbound/1',
  },
  businessUnit: { id: 73, businessKey: { code: 'ABC' } },
  number: 'OBShipment1',
  type: 'Outbound Shipment',
  status: 'Shipped',
  shipFromFacility: { id: 1, businessKey: { number: 'Atlanta1', 'businessUnit.code': 'ABC' } },
  shipToFacility: {
    id: 2,
    businessKey: { number: 'Atlanta2', 'businessUnit.code': 'ABC' },
    href: 'https://api.deposco.com/latest/facilities/2',
  },
  shipVia: 'UPS',
  shipMethod: 'UPS Ground',
  shipVendor: 'UPS2',
  trackingNumber: 'abc123',
  shipToContact: {
    name: 'John Doe',
    contactName: 'John Doe',
    attention: 'John Doe',
    phone: '123-456-7890',
    email: 'john@example.com',
  },
  shipToAddress: {
    line1: '123 Test Street',
    line2: 'APT 100',
    line3: 'BLDG 1',
    line4: 'BLDG 1',
    city: 'Alpharetta',
    stateProvince: 'GA',
    postalCode: '30009',
    country: 'US',
  },
  shipFromContact: { attention: 'John', phone: '123-456-7890' },
  shipFromAddress: {
    line1: '124 Test Street',
    line2: 'APT 100',
    city: 'Alpharetta',
    stateProvince: 'GA',
    postalCode: '30009',
    country: 'US',
  },
  shipmentDates: {
    plannedShipDate: '2024-01-01T00:00:00-05:00',
    actualShipDate: '2024-01-01T00:00:00-05:00',
    plannedArrivalDate: '2024-01-01T00:00:00-05:00',
  },
  totalWeight: { value: 1, units: 'lb' },
  chargeableWeight: { value: 1, units: 'lb' },
  totalPieces: 1,
  totalPackages: 1,
  shippingCosts: { shippingCost: 1, currencyCode: 'USD', freightTermsType: 'Prepaid' },
  shipMode: 'Ground',
  createdDate: '2024-01-01T00:00:00-05:00',
  updatedDate: '2024-01-01T00:00:00-05:00',
}

describe('deposco transformShipment (documented example)', () => {
  const out = transformShipment(DOCUMENTED_SHIPMENT)

  it('parses with the canonical ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })

  it('takes the id from self.id, the {shipmentId} of GET /shipments/outboundShipments/{shipmentId}', () => {
    expect(out.id).toBe('1')
    expect(out.reference).toBe('OBShipment1')
  })

  it('maps carrier, service and tracking from shipVendor, shipVia and trackingNumber', () => {
    expect(out.carrierId).toBe('UPS2')
    expect(out.serviceCode).toBe('UPS')
    expect(out.trackingNumber).toBe('abc123')
  })

  it('takes the warehouse from shipFromFacility.id, the id listWarehouses returns', () => {
    expect(out.warehouseId).toBe('1')
  })

  it('maps the documented address DTOs', () => {
    expect(out.destinationAddress).toEqual({
      name: 'John Doe',
      street1: '123 Test Street',
      street2: 'APT 100',
      city: 'Alpharetta',
      state: 'GA',
      postalCode: '30009',
      country: 'US',
      phone: '123-456-7890',
      email: 'john@example.com',
    })
    expect(out.originAddress).toEqual({
      street1: '124 Test Street',
      street2: 'APT 100',
      city: 'Alpharetta',
      state: 'GA',
      postalCode: '30009',
      country: 'US',
      phone: '123-456-7890',
    })
  })

  it('maps totalWeight with its documented unit', () => {
    expect(out.totalWeight).toEqual({ value: 1, unit: 'lb' })
  })

  it('maps dates', () => {
    expect(out.estimatedDeliveryAt?.toISOString()).toBe('2024-01-01T05:00:00.000Z')
    expect(out.createdAt?.toISOString()).toBe('2024-01-01T05:00:00.000Z')
    expect(out.updatedAt?.toISOString()).toBe('2024-01-01T05:00:00.000Z')
    expect(out.actualDeliveryAt).toBeUndefined()
  })

  it('invents no cost, label URL or mode', () => {
    expect(out.cost).toBeUndefined()
    expect(out.labelUrl).toBeUndefined()
    expect(out.mode).toBeUndefined()
  })

  it('keeps the raw record in metadata', () => {
    expect(out.metadata).toBe(DOCUMENTED_SHIPMENT)
  })
})

describe('deposco transformShipment status (documented enum)', () => {
  it.each([
    ['New', 'PENDING'],
    ['Shipping', 'PENDING'],
    ['Shipped', 'IN_TRANSIT'],
    ['Failed', 'EXCEPTION'],
    ['Rolled Back', 'UNKNOWN'],
  ])('%s -> %s', (status, expected) => {
    const out = transformShipment({ ...DOCUMENTED_SHIPMENT, status })
    expect(out.status).toBe(expected)
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })
})

describe('deposco transformShipment edge cases', () => {
  it('omits a weight whose unit is missing rather than assuming one', () => {
    const out = transformShipment({ ...DOCUMENTED_SHIPMENT, totalWeight: { value: 3 } })
    expect(out.totalWeight).toBeUndefined()
  })

  it('omits a country that is not ISO alpha-2', () => {
    const out = transformShipment({
      ...DOCUMENTED_SHIPMENT,
      shipToAddress: { city: 'Atlanta', country: 'USA' },
      shipToContact: null,
    })
    expect(out.destinationAddress).toEqual({ city: 'Atlanta' })
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })

  it('leaves the id unset when self is absent instead of inventing one', () => {
    const out = transformShipment({ number: 'X' })
    expect(out.id).toBeUndefined()
    expect(out.status).toBe('UNKNOWN')
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })
})

describe('deposco transformShipment: documented fields that are only sometimes present', () => {
  it('maps shipmentDates.actualArrivalDate ("Date that the shipment arrived at the destination facility.")', () => {
    const out = transformShipment({
      ...DOCUMENTED_SHIPMENT,
      shipmentDates: {
        ...DOCUMENTED_SHIPMENT.shipmentDates,
        actualArrivalDate: '2024-01-03T12:00:00-05:00',
      },
    })
    expect(out.actualDeliveryAt?.toISOString()).toBe('2024-01-03T17:00:00.000Z')
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })

  it('omits a negative weight rather than passing it to the schema', () => {
    const out = transformShipment({
      ...DOCUMENTED_SHIPMENT,
      totalWeight: { value: -1, units: 'lb' },
    })
    expect(out.totalWeight).toBeUndefined()
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })

  it('leaves an address unset when every documented field is absent', () => {
    const out = transformShipment({
      ...DOCUMENTED_SHIPMENT,
      shipToAddress: {},
      shipToContact: {},
    })
    expect(out.destinationAddress).toBeUndefined()
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })

  it('leaves an unparseable date unset instead of passing an Invalid Date', () => {
    const out = transformShipment({ ...DOCUMENTED_SHIPMENT, createdDate: 'not a date' })
    expect(out.createdAt).toBeUndefined()
    expect(() => ShipmentSchema.parse(out)).not.toThrow()
  })
})
