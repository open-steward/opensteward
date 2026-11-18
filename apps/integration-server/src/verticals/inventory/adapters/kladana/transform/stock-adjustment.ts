/**
 * Kladana inventory/stock-adjustment transform.
 *
 * Source: /entity/inventory
 * Key fields:
 *   id          — UUID
 *   name        — document number
 *   store       — warehouse reference
 *   applicable  — true = posted
 *   description — free-text note (used as reason proxy)
 *   moment      — document date
 *   created     — creation timestamp
 *   updated     — last modification
 *
 * Positions rows contain:
 *   assortment.meta.href    — product reference
 *   quantity                — counted/target quantity
 *   calculatedQuantity      — system-calculated quantity on hand before adjustment
 *   correctionAmount        — delta = quantity - calculatedQuantity
 *   correctionSum           — value of the adjustment in kopecks
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {strMap, toIso} from './shared'

interface KladanaMeta { href?: string }
interface KladanaRef { meta?: KladanaMeta }
interface KladanaInventoryPosition {
  assortment?: KladanaRef
  quantity?: number
  calculatedQuantity?: number
  correctionAmount?: number
  [key: string]: unknown
}

export interface RawKladanaStockAdjustment {
  id: string
  name?: string
  store?: KladanaRef
  applicable?: boolean
  description?: string
  moment?: string
  created?: string
  updated?: string
  positions?: { rows?: KladanaInventoryPosition[] }
  [key: string]: unknown
}

function extractId(ref: KladanaRef | undefined): string {
  const href = ref?.meta?.href ?? ''
  const parts = href.split('/')
  return parts[parts.length - 1] ?? ''
}

function mapReason(description: string | undefined): StockAdjustmentReason {
  const d = (description ?? '').toLowerCase()
  if (d.includes('count') || d.includes('инвентар')) return 'cycle_count'
  if (d.includes('damage') || d.includes('повреж')) return 'damage'
  if (d.includes('theft') || d.includes('кража')) return 'theft'
  if (d.includes('lost') || d.includes('потер')) return 'lost'
  if (d.includes('found') || d.includes('найден')) return 'found'
  if (d.includes('expir') || d.includes('срок')) return 'expiration'
  if (d.includes('correct') || d.includes('коррект')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawKladanaStockAdjustment): StockAdjustment {
  const positionRows = raw.positions?.rows ?? []
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: extractId(raw.store),
    reason: mapReason(raw.description),
    lines: positionRows.map((l) => {
      // correctionAmount = explicit delta if present, else derive from counted - calculated
      const delta = l.correctionAmount ?? (
        l.quantity !== undefined && l.calculatedQuantity !== undefined
          ? l.quantity - l.calculatedQuantity
          : 0
      )
      return {
        productId: extractId(l.assortment),
        deltaQuantity: delta,
        countedQuantity: l.quantity,
      }
    }),
    adjustedAt: toIso(raw.moment) ?? new Date(0).toISOString(),
    platform: 'kladana',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
