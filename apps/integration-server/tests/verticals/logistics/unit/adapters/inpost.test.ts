import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type InPostShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/inpost/transform/shipment'
import {
  transformLabel,
  type InPostLabelResponse,
} from '../../../../../src/verticals/logistics/adapters/inpost/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipmentResponse(
  overrides: Partial<InPostShipmentResponse> = {},
): InPostShipmentResponse {
  return {
    id: 'SHP-001',
    trackingNumber: 'INP123456789',
    serviceCode: 'INPOST_LOCKER_STANDARD',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
    ...overrides,
  }
}

function makeLabelResponse(overrides: Partial<InPostLabelResponse> = {}): InPostLabelResponse {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: 'INP123456789',
    serviceCode: 'INPOST_LOCKER_STANDARD',
    format: 'PDF',
    labelData: 'base64encodedlabeldata==',
    ...overrides,
  }
}

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('INP123456789')
    expect(result.carrierId).toBe('inpost')
    expect(result.serviceCode).toBe('INPOST_LOCKER_STANDARD')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeLabelResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.shipmentId).toBe('SHP-001')
    expect(result.trackingNumber).toBe('INP123456789')
    expect(result.carrierId).toBe('inpost')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing labelData', () => {
    const raw = makeLabelResponse({ labelData: undefined })
    expect(transformLabel(raw).base64).toBeUndefined()
  })

  it('handles missing format', () => {
    const raw = makeLabelResponse({ format: undefined })
    // defaults to PDF when undefined
    expect(transformLabel(raw).format).toBe('PDF')
  })
})
