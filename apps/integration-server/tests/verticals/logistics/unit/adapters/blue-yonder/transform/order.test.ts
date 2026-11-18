import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type BlueYonderOrderResponse,
  type BlueYonderOrderAddress,
  type BlueYonderOrderLineItem,
} from '../../../../../../../src/verticals/logistics/adapters/blue-yonder/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<BlueYonderOrderAddress> = {}): BlueYonderOrderAddress {
  return {
    name: 'Jane Doe',
    street1: '42 Ship St',
    street2: 'Apt 2',
    city: 'Seattle',
    state: 'WA',
    postalCode: '98101',
    country: 'US',
    ...overrides,
  }
}

function makeLineItem(overrides: Partial<BlueYonderOrderLineItem> = {}): BlueYonderOrderLineItem {
  return {
    lineId: 'line-001',
    itemId: 'ITEM-ABC',
    itemDescription: 'Widget',
    orderedQuantity: 10,
    pickedQuantity: 10,
    shippedQuantity: 10,
    unitOfMeasure: 'EA',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<BlueYonderOrderResponse> = {}): BlueYonderOrderResponse {
  return {
    orderId: 'BY-ORD-001',
    orderNumber: 'ORD-2024-001',
    status: 'NEW',
    priority: 'NORMAL',
    requestedShipDate: '2024-03-01T00:00:00Z',
    shipToAddress: makeAddress(),
    lineItems: [makeLineItem()],
    createdAt: '2024-02-28T00:00:00Z',
    updatedAt: '2024-02-28T12:00:00Z',
    ...overrides,
  }
}

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('maps id from orderId', () => {
    expect(transformOrder(makeRaw()).id).toBe('BY-ORD-001')
  })

  it('maps orderNumber from raw.orderNumber', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('ORD-2024-001')
  })

  it('returns undefined orderNumber when raw.orderNumber is absent', () => {
    expect(transformOrder(makeRaw({ orderNumber: undefined })).orderNumber).toBeUndefined()
  })

  // ── Status mapping ───────────────────────────────────────────────────────

  it('maps NEW status to PENDING', () => {
    expect(transformOrder(makeRaw({ status: 'NEW' })).status).toBe('PENDING')
  })

  it('maps PICKING status to PROCESSING', () => {
    expect(transformOrder(makeRaw({ status: 'PICKING' })).status).toBe('PROCESSING')
  })

  it('maps PACKED status to AWAITING_SHIPMENT', () => {
    expect(transformOrder(makeRaw({ status: 'PACKED' })).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps SHIPPED status to SHIPPED', () => {
    expect(transformOrder(makeRaw({ status: 'SHIPPED' })).status).toBe('SHIPPED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('defaults to PENDING for unmapped status', () => {
    expect(transformOrder(makeRaw({ status: 'HOLDING' })).status).toBe('PENDING')
  })

  it('defaults to PENDING when status is absent', () => {
    expect(transformOrder(makeRaw({ status: undefined })).status).toBe('PENDING')
  })

  // ── Address mapping ──────────────────────────────────────────────────────

  it('maps destinationAddress from shipToAddress', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('Seattle')
    expect(result.destinationAddress?.state).toBe('WA')
    expect(result.destinationAddress?.postalCode).toBe('98101')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps destinationAddress street1 and street2', () => {
    const result = transformOrder(makeRaw())
    expect(result.destinationAddress?.street1).toBe('42 Ship St')
    expect(result.destinationAddress?.street2).toBe('Apt 2')
  })

  it('returns undefined destinationAddress when shipToAddress is absent', () => {
    expect(transformOrder(makeRaw({ shipToAddress: undefined })).destinationAddress).toBeUndefined()
  })

  it('returns undefined destinationAddress when all address fields are absent', () => {
    const result = transformOrder(
      makeRaw({
        shipToAddress: {
          name: undefined,
          street1: undefined,
          city: undefined,
          state: undefined,
          postalCode: undefined,
          country: undefined,
        },
      }),
    )
    expect(result.destinationAddress).toBeUndefined()
  })

  // ── Date mapping ─────────────────────────────────────────────────────────

  it('maps orderAt from requestedShipDate', () => {
    // NOTE: the transform maps requestedShipDate → orderAt (not shippedAt)
    const result = transformOrder(makeRaw())
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.orderAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps createdAt as a Date', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as a Date', () => {
    expect(transformOrder(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('returns undefined orderAt when requestedShipDate is absent', () => {
    expect(transformOrder(makeRaw({ requestedShipDate: undefined })).orderAt).toBeUndefined()
  })

  // ── Metadata ─────────────────────────────────────────────────────────────

  it('passes metadata as the raw response', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  // ── Schema validation ─────────────────────────────────────────────────────

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('passes OrderSchema validation with minimal raw data', () => {
    const raw: BlueYonderOrderResponse = { orderId: 'BY-MIN-001' }
    expect(() => OrderSchema.parse(transformOrder(raw))).not.toThrow()
  })
})
