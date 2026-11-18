/**
 * Shared schema primitives used across canonical resource shapes in this
 * vertical. Keep this file small — add a new file under `src/core/schema/` for
 * each top-level canonical resource.
 */

import { z } from 'zod'
import { Amount, Iso4217Currency } from '@opensteward/shared'

export const MoneySchema = z.object({
  amount: Amount.meta({ example: 7999 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
})
export type Money = z.infer<typeof MoneySchema>

/**
 * Canonical `Money.amount` is an INTEGER in the currency's minor units. The
 * conversions live in `@opensteward/shared` now: eight other verticals needed
 * the same currency-aware arithmetic and were hardcoding `* 100` without it.
 * Re-exported here so this vertical's existing imports keep working.
 */
export { majorToMinor, minorToMajor, minorUnitExponent } from '@opensteward/shared'

export { AddressSchema } from '@opensteward/shared'
export type { Address } from '@opensteward/shared'

/**
 * Hosted-asset URL. Accepts either an absolute URL (e.g. `https://cdn/foo.jpg`)
 * or an absolute path (e.g. `/media/foo.jpg`) for adapters whose upstream
 * stores paths and resolves them against a per-store base URL on render.
 */
const AssetUrl = z
  .string()
  .min(1)
  .refine(
    (s) => {
      if (s.startsWith('/')) return true
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: 'Must be an absolute URL or an absolute path starting with /' },
  )

export const AttachmentSchema = z.object({
  id: z.string().meta({ example: 'att_wk2026_manual' }),
  filename: z.string().meta({ example: 'wireless-keyboard-manual.pdf' }),
  url: AssetUrl.describe('Hosted file URL or absolute path.').meta({
    example: 'https://cdn.acme.example/manuals/wireless-keyboard-manual.pdf',
  }),
  mimeType: z.string().describe('MIME type, e.g. `image/png`.').meta({ example: 'application/pdf' }),
})
export type Attachment = z.infer<typeof AttachmentSchema>

/**
 * Product / collection / variant imagery. Shopify models product images as a
 * positioned list; other platforms use similar shapes. Keep it minimal — the
 * untouched platform payload is always available via `metadata`.
 */
export const ImageSchema = z.object({
  id: z.string().optional().meta({ example: 'img_wk2026_hero' }),
  url: AssetUrl.describe('Hosted image URL or absolute path.').meta({
    example: 'https://cdn.acme.example/products/wireless-keyboard.jpg',
  }),
  alt: z.string().optional().meta({ example: 'Wireless Keyboard' }),
  width: z.number().int().min(0).optional().meta({ example: 1200 }),
  height: z.number().int().min(0).optional().meta({ example: 800 }),
  position: z.number().int().min(0).optional().describe('Display order, 0-indexed.').meta({ example: 0 }),
})
export type Image = z.infer<typeof ImageSchema>
