import { describe, it, expect } from 'vitest'
import { transformOrder, type ManhattanWmsOrderResponse } from '../../../../../src/verticals/logistics/adapters/manhattan-wms/transform/order'
import { transformWarehouse, type ManhattanWmsFacilityResponse } from '../../../../../src/verticals/logistics/adapters/manhattan-wms/transform/warehouse'
import { transformShipment, type ManhattanWmsShipmentResponse } from '../../../../../src/verticals/logistics/adapters/manhattan-wms/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrderResponse(overrides: Partial<ManhattanWmsOrderResponse> = {}): ManhattanWmsOrderResponse {
  return {
    orderId: 'ORD-001',
    orderNumber: 'WMS-2024-001',
    customerId: 'CUST-001',
    warehouseId: 'WH-001',
    status: 'ALLOCATED',
    shipmentIds: ['SHP-001'],
    currency: 'USD',
    totalAmount: 150.00,
    notes: 'Handle with care',
    requestedServiceCode: 'GROUND',
    orderAt: '2024-01-15T08:00:00Z',
    shippedAt: undefined,
    deliveredAt: undefined,
    cancelledAt: undefined,
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-01-16T10:00:00Z',
    ...overrides,
  }
}

function makeFacilityResponse(overrides: Partial<ManhattanWmsFacilityResponse> = {}): ManhattanWmsFacilityResponse {
  return {
    facilityId: 'FAC-001',
    name: 'Chicago Distribution Center',
    code: 'CHI-DC',
    address1: '123 Warehouse Blvd',
    address2: 'Suite 100',
    city: 'Chicago',
    state: 'IL',
    zipCode: '60601',
    country: 'US',
    phone: '312-555-0100',
    email: 'ops@chicago-dc.example.com',
    isActive: true,
    timezone: 'America/Chicago',
    cutoffTime: '14:00',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<ManhattanWmsShipmentResponse> = {}): ManhattanWmsShipmentResponse {
  return {
    id: 'SHP-001',
    referenceNumber: 'REF-123456',
    serviceType: 'GROUND',
    status: 'SHIPPED',
    createdAt: '2024-01-16T10:00:00Z',
    totalWeight: {
      value: 25,
      unit: 'LBS',
    },
    ...overrides,
  }
}

// ─── transformOrder ──────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps canonical fields', () => {
    const raw = makeOrderResponse()
    const result = transformOrder(raw)

    expect(result.id).toBe('ORD-001')
    expect(result.status).toBe('PROCESSING')
    expect(result.orderNumber).toBe('WMS-2024-001')
    expect(result.customerId).toBe('CUST-001')
    expect(result.warehouseId).toBe('WH-001')
    expect(result.shipmentIds).toEqual(['SHP-001'])
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(150.00)
    expect(result.notes).toBe('Handle with care')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrderResponse()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('maps all order statuses correctly', () => {
    const cases: [string | undefined, string][] = [
      ['RECEIVED', 'PENDING'],
      ['ALLOCATED', 'PROCESSING'],
      ['PICKING', 'PROCESSING'],
      ['PACKED', 'AWAITING_SHIPMENT'],
      ['SHIPPED', 'SHIPPED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'PENDING'],
      [undefined, 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOrderResponse({ status })
      expect(transformOrder(raw).status).toBe(expected)
    }
  })
})

// ─── transformWarehouse ──────────────────────────────────────────────────────

describe('transformWarehouse', () => {
  it('maps canonical fields', () => {
    const raw = makeFacilityResponse()
    const result = transformWarehouse(raw)

    expect(result.id).toBe('FAC-001')
    expect(result.name).toBe('Chicago Distribution Center')
    expect(result.code).toBe('CHI-DC')
    expect(result.address?.street1).toBe('123 Warehouse Blvd')
    expect(result.address?.street2).toBe('Suite 100')
    expect(result.address?.city).toBe('Chicago')
    expect(result.address?.state).toBe('IL')
    expect(result.address?.postalCode).toBe('60601')
    expect(result.address?.country).toBe('US')
    expect(result.isActive).toBe(true)
    expect(result.timezone).toBe('America/Chicago')
    expect(result.cutoffTime).toBe('14:00')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeFacilityResponse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('handles missing address gracefully', () => {
    const raw = makeFacilityResponse({
      address1: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
    })
    expect(transformWarehouse(raw).address).toBeUndefined()
  })

  it('defaults isActive to true', () => {
    const raw = makeFacilityResponse({ isActive: undefined })
    expect(transformWarehouse(raw).isActive).toBe(true)
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('REF-123456')
    expect(result.carrierId).toBe('manhattan-wms')
    expect(result.serviceCode).toBe('GROUND')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
