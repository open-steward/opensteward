import { describe, it, expect } from 'vitest'
import {
  ProductSchema,
  ProductVariantSchema,
  CollectionSchema,
  LocationSchema,
  InventoryLevelSchema,
  CustomerSchema,
  OrderSchema,
  FulfillmentSchema,
  RefundSchema,
  TransactionSchema,
  DiscountSchema,
  WebhookEventSchema,
} from '../../../../src/verticals/ecommerce/schema'

describe('ecommerce canonical schemas', () => {
  it('parses a minimal valid Product', () => {
    const parsed = ProductSchema.parse({
      id: 'prod_1',
      title: 'Red T-Shirt',
      metadata: {},
    })
    expect(parsed.id).toBe('prod_1')
  })

  it('parses a ProductVariant with money price', () => {
    const parsed = ProductVariantSchema.parse({
      id: 'var_1',
      price: { amount: 1999, currency: 'USD' },
      metadata: {},
    })
    expect(parsed.price.currency).toBe('USD')
  })

  it('parses Collection, Location, and InventoryLevel', () => {
    expect(
      CollectionSchema.parse({ id: 'c1', title: 'Summer', metadata: {} }).id,
    ).toBe('c1')
    expect(LocationSchema.parse({ id: 'l1', name: 'Main', metadata: {} }).name).toBe('Main')
    expect(
      InventoryLevelSchema.parse({
        id: 'var_1:l1',
        variantId: 'var_1',
        locationId: 'l1',
        available: 10,
        metadata: {},
      }).available,
    ).toBe(10)
  })

  it('parses Customer, Order, Fulfillment, Refund, Transaction, Discount', () => {
    CustomerSchema.parse({ id: 'cu1', metadata: {} })
    OrderSchema.parse({ id: 'o1', metadata: {} })
    FulfillmentSchema.parse({ id: 'f1', orderId: 'o1', metadata: {} })
    RefundSchema.parse({ id: 'r1', orderId: 'o1', metadata: {} })
    TransactionSchema.parse({ id: 't1', metadata: {} })
    DiscountSchema.parse({ id: 'd1', metadata: {} })
  })

  it('parses a WebhookEvent', () => {
    const parsed = WebhookEventSchema.parse({
      platform: 'shopify',
      type: 'orders.created',
      resourceType: 'orders',
      action: 'created',
      resourceId: 'o1',
      payload: {},
    })
    expect(parsed.resourceType).toBe('orders')
  })
})
