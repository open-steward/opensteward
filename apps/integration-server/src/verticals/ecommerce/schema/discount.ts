import { z } from 'zod'
import { Iso4217Currency, IsoDatetime, withUnknown } from '@opensteward/shared'
import { MoneySchema } from './shared'

export const DiscountTypeSchema = withUnknown([
  'PERCENTAGE',
  'FIXED_AMOUNT',
  'FREE_SHIPPING',
  'BUY_X_GET_Y',
])
export type DiscountType = z.infer<typeof DiscountTypeSchema>

export const DiscountAppliesToSchema = withUnknown(['ORDER', 'PRODUCTS', 'SHIPPING'])
export type DiscountAppliesTo = z.infer<typeof DiscountAppliesToSchema>

export const DiscountCustomerEligibilitySchema = withUnknown(['ALL', 'SPECIFIC'])
export type DiscountCustomerEligibility = z.infer<typeof DiscountCustomerEligibilitySchema>

export const DiscountSchema = z.object({
  id: z.string().meta({ example: 'disc_acme10' }),
  /** Redeemable code (for code-based discounts). */
  code: z.string().optional().meta({ example: 'ACME10' }),
  title: z.string().optional().meta({ example: 'Acme 10% Off' }),
  type: DiscountTypeSchema.optional().meta({ example: 'PERCENTAGE' }),
  /**
   * Discount value. Units depend on `type`:
   *  - PERCENTAGE → percent (0-100)
   *  - FIXED_AMOUNT → money amount in `currency`
   *  - FREE_SHIPPING / BUY_X_GET_Y → platform-specific
   */
  value: z.number().min(0).optional().meta({ example: 10 }),
  currency: Iso4217Currency.optional().meta({ example: 'USD' }),
  appliesTo: DiscountAppliesToSchema.optional().meta({ example: 'ORDER' }),
  productIds: z.array(z.string()).optional().meta({ example: ['prod_wk2026'] }),
  collectionIds: z.array(z.string()).optional().meta({ example: [] }),
  minimumPurchaseAmount: MoneySchema.optional(),
  usageLimit: z.number().int().min(0).optional().meta({ example: 100 }),
  usageCount: z.number().int().min(0).optional().meta({ example: 1 }),
  customerEligibility: DiscountCustomerEligibilitySchema.optional().meta({ example: 'ALL' }),
  startsAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  endsAt: IsoDatetime.optional().meta({ example: null }),
  createdAt: IsoDatetime.optional().meta({ example: '2026-01-15T09:30:00Z' }),
  metadata: z.record(z.string(), z.unknown()).meta({ example: { discountPlatformId: 'gid://shopify/DiscountCode/disc_acme10' } }),
})
export type Discount = z.infer<typeof DiscountSchema>
