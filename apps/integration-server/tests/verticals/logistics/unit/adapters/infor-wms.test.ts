import { describe, it, expect } from 'vitest'
import { transformOrder, type InforWmsOrderResponse } from '../../../../../src/verticals/logistics/adapters/infor-wms/transform/order'
import { transformWarehouse, type InforWmsWarehouseResponse } from '../../../../../src/verticals/logistics/adapters/infor-wms/transform/warehouse'
import { transformShipment, type InforWmsShipmentResponse } from '../../../../../src/verticals/logistics/adapters/infor-wms/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrderResponse(overrides: Partial<InforWmsOrderResponse> = {}): InforWmsOrderResponse {
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

function makeWarehouseResponse(overrides: Partial<InforWmsWarehouseResponse> = {}): InforWmsWarehouseResponse {
  return {
    warehouseId: 'WH-001',
    name: 'Dallas Distribution Center',
    code: 'DAL-DC',
    address1: '456 Logistics Way',
    address2: 'Building B',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    country: 'US',
    phone: '214-555-0200',
    email: 'ops@dallas-dc.example.com',
    isActive: true,
    timezone: 'America/Chicago',
    cutoffTime: '15:00',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<InforWmsShipmentResponse> = {}): InforWmsShipmentResponse {
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
      ['NEW', 'PENDING'],
      ['ALLOCATED', 'PROCESSING'],
      ['WAVE_PLANNED', 'PROCESSING'],
      ['PICKED', 'AWAITING_SHIPMENT'],
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
    const raw = makeWarehouseResponse()
    const result = transformWarehouse(raw)

    expect(result.id).toBe('WH-001')
    expect(result.name).toBe('Dallas Distribution Center')
    expect(result.code).toBe('DAL-DC')
    expect(result.address?.street1).toBe('456 Logistics Way')
    expect(result.address?.street2).toBe('Building B')
    expect(result.address?.city).toBe('Dallas')
    expect(result.address?.state).toBe('TX')
    expect(result.address?.postalCode).toBe('75201')
    expect(result.address?.country).toBe('US')
    expect(result.isActive).toBe(true)
    expect(result.timezone).toBe('America/Chicago')
    expect(result.cutoffTime).toBe('15:00')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeWarehouseResponse()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })

  it('handles missing address gracefully', () => {
    const raw = makeWarehouseResponse({
      address1: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
    })
    expect(transformWarehouse(raw).address).toBeUndefined()
  })

  it('defaults isActive to true', () => {
    const raw = makeWarehouseResponse({ isActive: undefined })
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
    expect(result.carrierId).toBe('infor-wms')
    expect(result.serviceCode).toBe('GROUND')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
