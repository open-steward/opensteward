import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShipiumShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<ShipiumShipment> = {}): ShipiumShipment {
  return {
    shipiumShipmentId: 'shp-001',
    partnerShipmentId: 'partner-ref-001',
    shipmentStatus: 'in_transit',
    carrierSelection: {
      carrierSelectionId: 'cs-001',
      carrier: 'fedex',
      serviceMethodCode: 'FEDEX_GROUND',
      serviceMethodName: 'FedEx Ground',
      totalCost: 15.75,
      currencyCode: 'USD',
      transitDays: 3,
      estimatedDeliveryDate: '2024-03-04T00:00:00Z',
    },
    carrierLabel: {
      shipiumLabelId: 'lbl-001',
      status: 'active',
      carrierTrackingId: 'TRACK-001',
      documents: [{ labelFormat: 'pdf', labelUrl: 'https://labels.example/lbl-001.pdf' }],
    },
    shipmentParameters: {
      shipFromAddress: {
        name: 'Warehouse',
        street1: '1 Industrial Ave',
        city: 'Oakland',
        state: 'CA',
        postalCode: '94601',
        countryCode: 'US',
      },
      destinationAddress: {
        name: 'Jane Doe',
        street1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94114',
        countryCode: 'US',
      },
      packagingType: {
        length: 12,
        width: 8,
        height: 4,
        weight: 2.5,
      },
    },
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment', () => {
  it('maps id from shipiumShipmentId', () => {
    expect(transformShipment(makeRaw()).id).toBe('shp-001')
  })

  it('maps trackingNumber from carrierLabel.carrierTrackingId', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRACK-001')
  })

  it('maps carrierId from carrierSelection.carrier', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('fedex')
  })

  it('maps IN_TRANSIT status', () => {
    expect(transformShipment(makeRaw({ shipmentStatus: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps LABEL_CREATED status', () => {
    expect(transformShipment(makeRaw({ shipmentStatus: 'label_created' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps DELIVERED status', () => {
    expect(transformShipment(makeRaw({ shipmentStatus: 'delivered' })).status).toBe('DELIVERED')
  })

  it('converts totalCost to minor units (cents) for cost.amount', () => {
    // 15.75 USD = 1575 cents
    expect(transformShipment(makeRaw()).cost?.amount).toBe(1575)
    expect(transformShipment(makeRaw()).cost?.currency).toBe('USD')
  })

  it('maps dimensions from packagingType', () => {
    const result = transformShipment(makeRaw())
    expect(result.dimensions?.length).toBe(12)
    expect(result.dimensions?.width).toBe(8)
    expect(result.dimensions?.height).toBe(4)
    expect(result.dimensions?.unit).toBe('in')
  })

  it('maps totalWeight from packagingType.weight', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps labelUrl from PDF document', () => {
    expect(transformShipment(makeRaw()).labelUrl).toBe('https://labels.example/lbl-001.pdf')
  })

  it('maps reference from partnerShipmentId', () => {
    expect(transformShipment(makeRaw()).reference).toBe('partner-ref-001')
  })

  it('maps estimatedDeliveryAt from carrierSelection', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toEqual(
      new Date('2024-03-04T00:00:00Z'),
    )
  })

  it('maps destinationAddress country from countryCode', () => {
    expect(transformShipment(makeRaw()).destinationAddress?.country).toBe('US')
  })

  it('passes schema validation', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing carrierLabel gracefully', () => {
    const result = transformShipment(makeRaw({ carrierLabel: null }))
    expect(result.trackingNumber).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
  })

  it('handles missing carrierSelection gracefully', () => {
    const result = transformShipment(makeRaw({ carrierSelection: null }))
    expect(result.carrierId).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })
})
