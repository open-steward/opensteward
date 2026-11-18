/**
 * Shared schema primitives for the payments vertical.
 *
 * Money is intentionally integer **minor units** (cents, paise, satoshi, …) —
 * never floats, never decimal strings. Every Money instance carries an ISO 4217
 * currency so callers never have to guess the denomination.
 */

import { z } from 'zod'
import { Iso4217Currency } from '@opensteward/shared'

export const MoneySchema = z.object({
  amount: z
    .number()
    .int()
    .describe('Amount in integer minor units (e.g. cents). May be negative for credits / refunds.')
    .meta({ example: 125000 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
})
export type Money = z.infer<typeof MoneySchema>

export { AddressSchema } from '@opensteward/shared'
export type { Address } from '@opensteward/shared'
