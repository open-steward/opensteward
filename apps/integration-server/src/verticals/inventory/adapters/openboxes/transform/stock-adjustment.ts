import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * OpenBoxes inventory transaction / adjustment returned from:
 *   GET /openboxes/api/generic/transaction
 *   GET /openboxes/api/generic/inventoryItem/:id/adjustments  (if available)
 *
 * Response envelope: { data: RawOpenboxesStockAdjustment[] }
 *
 * OpenBoxes represents adjustments as Transaction records.
 * transactionType.transactionCode distinguishes adjustment direction.
 */
export interface RawOpenboxesStockAdjustment {
  id: string
  location?: { id?: string; name?: string } | null
  transactionType?: {
    id?: string
    name?: string
    transactionCode?: string
  } | null
  transactionEntries?: Array<{
    id?: string
    product?: { id?: string; productCode?: string }
    inventoryItem?: { id?: string; lotNumber?: string }
    quantity?: number
    quantityOnHand?: number
  }> | null
  transactionDate?: string | null
  createdBy?: { id?: string; name?: string; firstName?: string; lastName?: string } | null
  comment?: string | null
  [key: string]: unknown
}

function mapReason(transactionCode: string | null | undefined): StockAdjustmentReason {
  const code = (transactionCode ?? '').toUpperCase()
  if (code === 'CREDIT' || code === 'DEBIT') return 'correction'
  if (code.includes('COUNT') || code === 'INVENTORY') return 'cycle_count'
  if (code.includes('EXPIR')) return 'expiration'
  if (code.includes('DAMAGE')) return 'damage'
  if (code.includes('LOSS') || code.includes('LOST')) return 'lost'
  return 'other'
}

export function transformStockAdjustment(raw: RawOpenboxesStockAdjustment): StockAdjustment {
  const lines = (raw.transactionEntries ?? []).map((e) => ({
    productId: e.product?.id ?? '',
    deltaQuantity: e.quantity ?? 0,
    countedQuantity: e.quantityOnHand,
    notes: pickStr(raw.comment),
  }))

  const createdByName = (raw.createdBy?.name ??
    [raw.createdBy?.firstName, raw.createdBy?.lastName].filter(Boolean).join(' ')) || undefined

  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.location?.id ?? '',
    reason: mapReason(raw.transactionType?.transactionCode),
    lines,
    adjustedAt: toIso(raw.transactionDate) ?? new Date(0).toISOString(),
    adjustedBy: createdByName,
    platform: 'openboxes',
    metadata: strMap({
      transactionTypeCode: raw.transactionType?.transactionCode,
      transactionTypeName: raw.transactionType?.name,
    }),
    raw,
  }
}
