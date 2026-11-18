import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  mapFulfillmentStatus,
  type RawPddPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePackage(overrides: Partial<RawPddPackage> = {}): RawPddPackage {
  return {
    order_sn: 'PDD2024010100000001',
    tracking_number: 'SF1234567890',
    logistics_company: 'SF',
    logistics_company_name: '顺丰速运',
    package_status: 1, // SHIPPED
    created_time: 1704067200,     // 2024-01-01T00:00:00Z
    updated_time: 1704153600,     // 2024-01-02T00:00:00Z
    estimated_delivery_time: 1704240000, // 2024-01-03T00:00:00Z
    confirm_time: undefined,
    warehouse_id: 'WH-SZ-001',
    item_list: [
      { sub_order_sn: 'PDD2024010100000001-01' },
      { sub_order_sn: 'PDD2024010100000001-02' },
    ],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformFulfillment (Pinduoduo)', () => {
  it('builds fulfillment id as order_sn:tracking_number when tracking is present', () => {
    const result = transformFulfillment(makePackage())
    expect(result.id).toBe('PDD2024010100000001:SF1234567890')
  })

  it('builds fulfillment id as just order_sn when no tracking number', () => {
    const result = transformFulfillment(makePackage({ tracking_number: undefined }))
    expect(result.id).toBe('PDD2024010100000001')
  })

  it('sets orderId to order_sn', () => {
    const result = transformFulfillment(makePackage())
    expect(result.orderId).toBe('PDD2024010100000001')
  })

  it('maps tracking_number to trackingNumber', () => {
    const result = transformFulfillment(makePackage())
    expect(result.trackingNumber).toBe('SF1234567890')
  })

  it('maps logistics_company_name to carrier', () => {
    const result = transformFulfillment(makePackage())
    expect(result.carrier).toBe('顺丰速运')
  })

  it('falls back to logistics_company code when name is absent', () => {
    const result = transformFulfillment(
      makePackage({ logistics_company_name: undefined }),
    )
    expect(result.carrier).toBe('SF')
  })

  it('maps warehouse_id to locationId', () => {
    const result = transformFulfillment(makePackage())
    expect(result.locationId).toBe('WH-SZ-001')
  })

  it('maps package status 1 (SHIPPED) to SUCCESS', () => {
    const result = transformFulfillment(makePackage({ package_status: 1 }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps package status 0 (UNSHIPPED) to OPEN', () => {
    const result = transformFulfillment(makePackage({ package_status: 0 }))
    expect(result.status).toBe('OPEN')
  })

  it('maps package status 2 (DELIVERED) to SUCCESS', () => {
    const result = transformFulfillment(makePackage({ package_status: 2 }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps package status 3 (CANCELLED) to CANCELLED', () => {
    const result = transformFulfillment(makePackage({ package_status: 3 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps package status 4 (EXCEPTION) to ERROR', () => {
    const result = transformFulfillment(makePackage({ package_status: 4 }))
    expect(result.status).toBe('ERROR')
  })

  it('maps package status 5 (RETURNING) to OPEN', () => {
    const result = transformFulfillment(makePackage({ package_status: 5 }))
    expect(result.status).toBe('OPEN')
  })

  it('maps package status 6 (RETURNED) to CANCELLED', () => {
    const result = transformFulfillment(makePackage({ package_status: 6 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('sets deliveredAt for status=2 (DELIVERED)', () => {
    const result = transformFulfillment(
      makePackage({ package_status: 2, confirm_time: 1704240000 }),
    )
    expect(result.deliveredAt).toBe('2024-01-03T00:00:00.000Z')
  })

  it('does not set deliveredAt for non-delivered statuses', () => {
    const result = transformFulfillment(makePackage({ package_status: 1 }))
    expect(result.deliveredAt).toBeUndefined()
  })

  it('maps estimated_delivery_time to estimatedDeliveryAt', () => {
    const result = transformFulfillment(makePackage())
    expect(result.estimatedDeliveryAt).toBe('2024-01-03T00:00:00.000Z')
  })

  it('maps item_list to lineItems', () => {
    const result = transformFulfillment(makePackage())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({
      lineItemId: 'PDD2024010100000001-01',
      quantity: 1,
    })
    expect(result.lineItems![1]).toEqual({
      lineItemId: 'PDD2024010100000001-02',
      quantity: 1,
    })
  })

  it('omits lineItems when item_list is empty', () => {
    const result = transformFulfillment(makePackage({ item_list: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('converts created_time and updated_time to ISO', () => {
    const result = transformFulfillment(makePackage())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('sets shippedAt from updated_time when package_status >= 1', () => {
    const result = transformFulfillment(makePackage({ package_status: 1 }))
    expect(result.shippedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('does not set shippedAt when package_status is 0 (unshipped)', () => {
    const result = transformFulfillment(makePackage({ package_status: 0 }))
    expect(result.shippedAt).toBeUndefined()
  })

  it('stores the unmodified raw package object in metadata', () => {
    const raw = makePackage()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
    expect(result.metadata['order_sn']).toBe('PDD2024010100000001')
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makePackage())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('defaults status to PENDING for unknown package_status', () => {
    const result = transformFulfillment(makePackage({ package_status: 99 }))
    expect(result.status).toBe('PENDING')
  })
})

describe('transformFulfillments (Pinduoduo)', () => {
  it('transforms a list of packages', () => {
    const packages = [
      makePackage({ order_sn: 'PDD-001', tracking_number: 'SF001' }),
      makePackage({ order_sn: 'PDD-002', tracking_number: 'YT002' }),
    ]
    const result = transformFulfillments(packages)
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('PDD-001:SF001')
    expect(result[1]!.id).toBe('PDD-002:YT002')
  })

  it('returns empty array for empty input', () => {
    expect(transformFulfillments([])).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(transformFulfillments(undefined)).toEqual([])
  })
})

describe('mapFulfillmentStatus (Pinduoduo)', () => {
  it('maps all known PDD package status codes', () => {
    expect(mapFulfillmentStatus(0)).toBe('OPEN')
    expect(mapFulfillmentStatus(1)).toBe('SUCCESS')
    expect(mapFulfillmentStatus(2)).toBe('SUCCESS')
    expect(mapFulfillmentStatus(3)).toBe('CANCELLED')
    expect(mapFulfillmentStatus(4)).toBe('ERROR')
    expect(mapFulfillmentStatus(5)).toBe('OPEN')
    expect(mapFulfillmentStatus(6)).toBe('CANCELLED')
  })

  it('returns PENDING for unknown or absent status', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
    expect(mapFulfillmentStatus(99)).toBe('PENDING')
  })
})
