/**
 * Optional catalog resources — `Plan`, `Price`, `Product`. Surfaced by gateways
 * that expose subscription billing as first-class records (Stripe, Square,
 * Razorpay, …). Adapters with no native equivalent leave these tables empty.
 */

import { z } from 'zod'
import { Iso4217Currency, IsoDatetime } from '@opensteward/shared'

export const BillingIntervalSchema = z.enum(['day', 'week', 'month', 'year'])
export type BillingInterval = z.infer<typeof BillingIntervalSchema>

export const ProductSchema = z.object({
  id: z.string().meta({ example: 'prod_1042' }),
  externalId: z.string().meta({ example: 'prod_1042' }),
  name: z.string().meta({ example: 'Acme Industries Subscription' }),
  description: z.string().optional().meta({ example: 'Invoice INV-1042' }),
  active: z.boolean().optional().meta({ example: true }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Product = z.infer<typeof ProductSchema>

export const PriceSchema = z.object({
  id: z.string().meta({ example: 'price_1042' }),
  externalId: z.string().meta({ example: 'price_1042' }),
  productId: z.string().meta({ example: 'prod_1042' }),
  nickname: z.string().optional().meta({ example: 'Acme Monthly' }),
  active: z.boolean().optional().meta({ example: true }),
  unitAmount: z.number().int().describe('Price per unit in minor units.').meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  /** `recurring` for subscriptions, `one_time` for ad-hoc invoicing. */
  type: z.enum(['recurring', 'one_time']).meta({ example: 'recurring' }),
  interval: BillingIntervalSchema.optional().meta({ example: 'month' }),
  intervalCount: z.number().int().min(1).optional().meta({ example: 1 }),
  trialPeriodDays: z.number().int().min(0).optional().meta({ example: 0 }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Price = z.infer<typeof PriceSchema>

export const PlanSchema = z.object({
  id: z.string().meta({ example: 'plan_1042' }),
  externalId: z.string().meta({ example: 'plan_1042' }),
  productId: z.string().optional().meta({ example: 'prod_1042' }),
  nickname: z.string().optional().meta({ example: 'Acme Monthly' }),
  active: z.boolean().optional().meta({ example: true }),
  amount: z.number().int().meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
  interval: BillingIntervalSchema.meta({ example: 'month' }),
  intervalCount: z.number().int().min(1).optional().meta({ example: 1 }),
  trialPeriodDays: z.number().int().min(0).optional().meta({ example: 0 }),
  gateway: z.string().meta({ example: 'stripe' }),
  metadata: z.record(z.string(), z.string()),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  updatedAt: IsoDatetime.optional().meta({ example: '2026-02-01T14:20:00Z' }),
  raw: z.unknown().optional(),
})
export type Plan = z.infer<typeof PlanSchema>
