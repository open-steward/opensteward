import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type BpostShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/bpost/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/bpost/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipmentResponse(
  overrides: Partial<BpostShipmentResponse> = {},
): BpostShipmentResponse {
  return {
    shipmentId: 'SHP-001',
    barcode: '323212345678901234',
    serviceCode: 'BPACK_24H',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
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
    expect(result.trackingNumber).toBe('323212345678901234')
    expect(result.carrierId).toBe('bpost')
    expect(result.serviceCode).toBe('BPACK_24H')
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
    const raw = makeShipmentResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.shipmentId).toBe('SHP-001')
    expect(result.trackingNumber).toBe('323212345678901234')
    expect(result.carrierId).toBe('bpost')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing labelData', () => {
    const raw = makeShipmentResponse({ labelData: undefined })
    expect(transformLabel(raw).base64).toBeUndefined()
  })
})
