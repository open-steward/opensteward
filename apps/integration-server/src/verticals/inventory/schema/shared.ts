/**
 * Shared schema primitives for the inventory vertical.
 *
 * Read-only B2B tenant-mode. Schema-as-firewall: no product images,
 * no supplier banking, no manufacturing BOM, no customer order data.
 */
import { z } from 'zod'
import { Amount, Iso4217Currency, withUnknown } from '@opensteward/shared'

export const UnitOfMeasureSchema = withUnknown(['each', 'kg', 'lb', 'litre', 'oz', 'metre', 'unit'])
export type UnitOfMeasure = z.infer<typeof UnitOfMeasureSchema>

export const LocationTypeSchema = withUnknown(['warehouse', 'store', 'virtual', 'transit', 'supplier'])
export type LocationType = z.infer<typeof LocationTypeSchema>

export const PurchaseOrderStatusSchema = withUnknown([
  'draft',
  'sent',
  'partially_received',
  'received',
  'closed',
  'cancelled',
])
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>

export const StockTransferStatusSchema = withUnknown([
  'draft',
  'in_transit',
  'completed',
  'cancelled',
])
export type StockTransferStatus = z.infer<typeof StockTransferStatusSchema>

export const StockAdjustmentReasonSchema = withUnknown([
  'cycle_count',
  'damage',
  'theft',
  'lost',
  'found',
  'expiration',
  'correction',
  'other',
])
export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReasonSchema>

export const MoneySchema = z.object({
  amount: Amount.meta({ example: 4999 }),
  currency: Iso4217Currency.meta({ example: 'USD' }),
})
export type Money = z.infer<typeof MoneySchema>

export { AddressSchema } from '@opensteward/shared'
export type { Address } from '@opensteward/shared'
