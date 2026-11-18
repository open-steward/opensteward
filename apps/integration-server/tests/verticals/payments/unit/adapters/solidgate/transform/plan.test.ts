import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  transformPrice,
  transformProduct,
} from '../../../../../../../src/verticals/payments/adapters/solidgate/transform/plan'
import {
  PlanSchema,
  PriceSchema,
  ProductSchema,
} from '../../../../../../../src/verticals/payments/schema/plan'
import { oneTimeProduct, price, recurringProduct } from '../fixtures/documented'

describe('solidgate transformProduct', () => {
  it('maps the documented example product', () => {
    const p = ProductSchema.parse(transformProduct(recurringProduct()))
    expect(p.id).toBe('cb43b415-5522-4373-b026-a365462f9114')
    expect(p.externalId).toBe(p.id)
    expect(p.name).toBe('Luxury product')
    expect(p.description).toBe('This product is the best product all over the world')
    expect(p.active).toBe(true)
    expect(p.metadata).toEqual({ access_duration: '30d', plan_tier: 'premium' })
    expect(p.createdAt).toBe('2025-05-31T12:53:12Z')
    expect(p.gateway).toBe('solidgate')
  })

  it('is inactive when disabled', () => {
    expect(
      ProductSchema.parse(transformProduct({ ...recurringProduct(), status: 'disabled' })).active,
    ).toBe(false)
  })
})

describe('solidgate transformPrice', () => {
  it('maps a price of a recurring product', () => {
    const p = PriceSchema.parse(transformPrice(price(), recurringProduct()))
    expect(p.id).toBe('cb43b415-5522-4373-b026-a365462f9114:cb43b415-5522-4373-b026-a365462f9114')
    expect(p.externalId).toBe('cb43b415-5522-4373-b026-a365462f9114')
    expect(p.productId).toBe('cb43b415-5522-4373-b026-a365462f9114')
    expect(p.unitAmount).toBe(1000)
    expect(p.currency).toBe('USD')
    expect(p.type).toBe('recurring')
    expect(p.interval).toBe('day')
    expect(p.intervalCount).toBe(10)
    expect(p.active).toBe(true)
    expect(p.metadata).toEqual({ default: 'false', country: 'USA' })
  })

  it('maps a price of a one-time product without an interval', () => {
    const p = PriceSchema.parse(transformPrice(price(), oneTimeProduct()))
    expect(p.type).toBe('one_time')
    expect(p.interval).toBeUndefined()
    expect(p.intervalCount).toBeUndefined()
  })
})

describe('solidgate transformPlan', () => {
  it('maps a price of a recurring product to a plan', () => {
    const plan = transformPlan(price(), recurringProduct())
    const p = PlanSchema.parse(plan)
    expect(p.id).toBe('cb43b415-5522-4373-b026-a365462f9114:cb43b415-5522-4373-b026-a365462f9114')
    expect(p.productId).toBe('cb43b415-5522-4373-b026-a365462f9114')
    expect(p.nickname).toBe('Luxury product')
    expect(p.amount).toBe(1000)
    expect(p.currency).toBe('USD')
    expect(p.interval).toBe('day')
    expect(p.intervalCount).toBe(10)
    expect(p.active).toBe(true)
  })

  it('is inactive when its product is disabled, even with an active price', () => {
    const plan = transformPlan(price(), { ...recurringProduct(), status: 'disabled' })
    expect(PlanSchema.parse(plan).active).toBe(false)
  })

  it('is null for a one-time product', () => {
    expect(transformPlan(price(), oneTimeProduct())).toBeNull()
  })
})
