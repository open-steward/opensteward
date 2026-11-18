import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GigShipment,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<GigShipment> = {}): GigShipment {
  return {
    id: 'gig-shp-001',
    waybillNumber: 'WB123456',
    referenceNumber: 'REF-001',
    shipmentStatus: 'InTransit',
    status: null,
    serviceCode: 'EXPRESS',
    serviceName: 'GIG Express',
    senderDetail: {
      name: 'Alice Sender',
      address: '5 Lagos Road',
      city: 'Lagos',
      state: 'LA',
      country: 'NG',
      postalCode: '100001',
      phoneNumber: '+2348001234567',
    },
    receiverDetail: {
      name: 'Bob Receiver',
      address: '10 Abuja Way',
      city: 'Abuja',
      state: 'FC',
      country: 'NG',
      postalCode: '900001',
      phoneNumber: '+2348007654321',
    },
    weight: 2.5,
    weightUnit: 'kg',
    deliveryPrice: 1500,
    currency: 'NGN',
    declaredValue: 5000,
    pickupDate: '2024-03-01T00:00:00Z',
    estimatedDeliveryDate: '2024-03-03T00:00:00Z',
    deliveredDate: null,
    labelUrl: 'https://labels.giglogistics.example/WB123456.pdf',
    description: 'Electronics',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('gig-logistics transformShipment', () => {
  it('maps id', () => {
    expect(transformShipment(makeShipment()).id).toBe('gig-shp-001')
  })

  it('maps waybillNumber as trackingNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('WB123456')
  })

  it('maps referenceNumber as reference', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-001')
  })

  it('maps InTransit shipmentStatus → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps pending → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'pending' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps Delivered → DELIVERED', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'Delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('maps OutForDelivery → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'OutForDelivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps Returned → RETURNED', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'Returned' })).status).toBe('RETURNED')
  })

  it('maps Cancelled → CANCELLED', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'Cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps Exception → EXCEPTION', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: 'Exception' })).status).toBe(
      'EXCEPTION',
    )
  })

  it('maps null status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ shipmentStatus: null, status: null })).status).toBe(
      'UNKNOWN',
    )
  })

  it('falls back to status field when shipmentStatus is null', () => {
    expect(
      transformShipment(makeShipment({ shipmentStatus: null, status: 'Delivered' })).status,
    ).toBe('DELIVERED')
  })

  it('maps weight and unit', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps deliveryPrice as cost in NGN', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(1500)
    expect(result.cost?.currency).toBe('NGN')
  })

  it('uses GIG_DEFAULT_CURRENCY (NGN) when currency is null', () => {
    const result = transformShipment(makeShipment({ currency: null }))
    expect(result.cost?.currency).toBe('NGN')
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://labels.giglogistics.example/WB123456.pdf',
    )
  })

  it('maps description as notes', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Electronics')
  })

  it('maps estimatedDeliveryDate as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps sender address name', () => {
    expect(transformShipment(makeShipment()).originAddress?.name).toBe('Alice Sender')
  })

  it('maps receiver address name', () => {
    expect(transformShipment(makeShipment()).destinationAddress?.name).toBe('Bob Receiver')
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
