/**
 * 2Checkout (Verifone) Product / Pricing Config → canonical Plan.
 *
 * 2Checkout models subscription pricing via Pricing Configurations attached
 * to Products. Each `PricingConfiguration` has a billing interval (monthly,
 * annual, etc.) and a price per cycle per currency. We map each unique
 * billing-interval tier to a canonical `Plan`.
 *
 * API path: GET /products/{productCode}/pricing-configurations/
 *
 * Money arrives as major-unit decimal in the `Prices` / `BasePrice` blocks;
 * the canonical `Plan.amount` is stored in minor units (cents).
 *
 * Docs: https://verifone.cloud/docs/2checkout/API-Reference
 */
import type { BillingInterval, Plan } from '../../../schema/plan'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawVerifone2checkoutPricePoint {
  Currency?: string | null
  Amount?: string | number | null
  RecommendedRetailPrice?: string | number | null
  [k: string]: unknown
}

export interface RawVerifone2checkoutPricingConfig {
  /** Unique pricing config code. */
  Code?: string | null
  /** Human-readable name (used as Plan nickname). */
  Name?: string | null
  /** Deprecated legacy `Type` field — still present in some responses. */
  Type?: string | null
  /** Billing cycle identifier: `MONTHLY`, `YEARLY`, `WEEKLY`, etc. */
  BillingCycle?: string | null
  /** Interval count (e.g. `3` for quarterly). */
  BillingCycleNumber?: number | string | null
  /** Trial period in days. */
  TrialDays?: number | null
  /** Price points keyed by currency or in an array. */
  Prices?: RawVerifone2checkoutPricePoint[] | null
  /** Base price (single currency shortcut). */
  BasePrice?: string | number | null
  Currency?: string | null
  /** ISO dates. */
  CreatedAt?: string | null
  UpdatedAt?: string | null
  /** Parent product code for building plan id. */
  ProductCode?: string | null
  [k: string]: unknown
}

const INTERVAL_MAP: Record<string, BillingInterval> = {
  DAILY: 'day',
  DAY: 'day',
  WEEKLY: 'week',
  WEEK: 'week',
  MONTHLY: 'month',
  MONTH: 'month',
  YEARLY: 'year',
  YEAR: 'year',
  ANNUAL: 'year',
}

function mapInterval(raw: string | null | undefined): BillingInterval {
  if (!raw) return 'month'
  return INTERVAL_MAP[raw.toUpperCase()] ?? 'month'
}

function parseIntervalCount(raw: number | string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function pickPrice(config: RawVerifone2checkoutPricingConfig): { amount: number; currency: string } {
  const prices = config.Prices ?? []
  const currency = pickCurrency(config.Currency ?? prices[0]?.Currency)
  const match = prices.find((p) => pickCurrency(p.Currency) === currency) ?? prices[0]
  const raw = match?.Amount ?? match?.RecommendedRetailPrice ?? config.BasePrice
  return {
    amount: toMinorUnits(raw, currency) ?? 0,
    currency,
  }
}

export function transformPlan(raw: RawVerifone2checkoutPricingConfig): Plan {
  const { amount, currency } = pickPrice(raw)
  const code = pickStr(raw.Code) ?? ''
  const id = raw.ProductCode ? `${raw.ProductCode}:${code}` : code

  return {
    id,
    externalId: id,
    productId: pickStr(raw.ProductCode),
    nickname: pickStr(raw.Name),
    active: true,
    amount,
    currency,
    interval: mapInterval(raw.BillingCycle),
    intervalCount: parseIntervalCount(raw.BillingCycleNumber),
    trialPeriodDays: raw.TrialDays ?? undefined,
    gateway: 'verifone-2checkout',
    metadata: strMap({
      code: raw.Code,
      billingCycle: raw.BillingCycle,
      type: raw.Type,
    }),
    createdAt: toIsoDatetime(raw.CreatedAt),
    updatedAt: toIsoDatetime(raw.UpdatedAt),
    raw,
  }
}
