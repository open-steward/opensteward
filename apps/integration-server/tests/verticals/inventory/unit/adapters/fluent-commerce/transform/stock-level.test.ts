import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawFluentCommerceInventoryPosition,
} from '../../../../../../../src/verticals/inventory/adapters/fluent-commerce/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('transformStockLevel — fluent-commerce with onHand', () => {
  const raw: RawFluentCommerceInventoryPosition = {
    ref: 'INV-POS-001',
    productRef: 'SKU-WK-2024',
    locationRef: 'WH-SF-01',
    onHand: 100,
    status: 'ACTIVE',
    // InventoryPosition.quantities is an InventoryQuantityConnection.
    quantities: {
      edges: [
        { node: { type: 'RESERVED', quantity: 15 } },
        { node: { type: 'LAST_ON_HAND', quantity: 95 } },
      ],
    },
  }
  const result = transformStockLevel(raw)

  it('maps id from raw.ref', () => {
    expect(result.id).toBe('INV-POS-001')
  })

  it('maps productId from productRef', () => {
    expect(result.productId).toBe('SKU-WK-2024')
  })

  it('maps locationId from locationRef', () => {
    expect(result.locationId).toBe('WH-SF-01')
  })

  it('maps quantityOnHand from onHand (preferring onHand over LAST_ON_HAND)', () => {
    expect(result.quantityOnHand).toBe(100)
  })

  it('maps quantityCommitted from RESERVED quantity', () => {
    expect(result.quantityCommitted).toBe(15)
  })

  it('computes quantityAvailable as onHand - reserved', () => {
    expect(result.quantityAvailable).toBe(85)
  })

  it('sets platform to fluent-commerce', () => {
    expect(result.platform).toBe('fluent-commerce')
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — fluent-commerce LAST_ON_HAND fallback', () => {
  const raw: RawFluentCommerceInventoryPosition = {
    ref: 'INV-POS-002',
    productRef: 'SKU-001',
    locationRef: 'WH-001',
    quantities: { edges: [{ node: { type: 'LAST_ON_HAND', quantity: 50 } }] },
  }
  const result = transformStockLevel(raw)

  it('falls back quantityOnHand to LAST_ON_HAND quantity when onHand is absent', () => {
    expect(result.quantityOnHand).toBe(50)
  })

  it('leaves quantityAvailable undefined when reserved not present', () => {
    expect(result.quantityAvailable).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — fluent-commerce null edges in the quantities connection', () => {
  // The schema types the edges as `[InventoryQuantityEdge]` and each edge's
  // node as `InventoryQuantity`, all nullable: a null is skipped, not read.
  const raw: RawFluentCommerceInventoryPosition = {
    ref: 'INV-POS-004',
    productRef: 'SKU-003',
    locationRef: 'WH-003',
    onHand: 40,
    quantities: {
      edges: [null, { node: null }, {}, { node: { type: 'RESERVED', quantity: 4 } }],
    },
  }
  const result = transformStockLevel(raw)

  it('reads RESERVED from the edges that have a node', () => {
    expect(result.quantityCommitted).toBe(4)
    expect(result.quantityAvailable).toBe(36)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformStockLevel — fluent-commerce no quantities', () => {
  const raw: RawFluentCommerceInventoryPosition = {
    ref: 'INV-POS-003',
    productRef: 'SKU-002',
    locationRef: 'WH-002',
  }
  const result = transformStockLevel(raw)

  it('defaults quantityOnHand to 0 when no onHand and no quantities', () => {
    expect(result.quantityOnHand).toBe(0)
  })

  it('passes schema validation', () => {
    expect(() => StockLevelSchema.parse(result)).not.toThrow()
  })
})
