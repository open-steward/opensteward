/**
 * Transform D365 SCM InventJournalTableEntity (inventory counting / adjustment journal)
 * → canonical StockAdjustment.
 *
 * D365 uses "inventory journals" for all stock-count and adjustment transactions.
 * The InventJournalTables OData entity exposes the journal header; lines are
 * fetched via InventJournalLines (joined or expanded).
 *
 * Header key fields:
 *   JournalNumber            — primary key
 *   JournalType              — "Movement" | "StockCount" | "Adjustment" | ...
 *   Description              — free-text description (used as reason)
 *   TransDate                — journal date (ISO or /Date(ms)/)
 *   CreatedByUserId          — who created the journal
 *   DataAreaId               — legal entity
 *   JournalPostingStatus     — "Posted" | "NotPosted"
 *
 * Line key fields:
 *   JournalNumber            — FK to header
 *   ItemNumber               — product
 *   WarehouseId              — location
 *   Quantity                 — delta quantity (positive = addition, negative = reduction)
 *   CorrectionQuantity       — counted quantity (for stock-count journals)
 *   JournalLineDescription   — line-level notes
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawD365InventJournalLine {
  JournalNumber: string
  LineNumber?: number | string
  ItemNumber: string
  WarehouseId?: string
  Quantity?: number | string
  CorrectionQuantity?: number | string
  JournalLineDescription?: string
  [key: string]: unknown
}

export interface RawD365InventJournal {
  JournalNumber: string
  JournalType?: string
  Description?: string
  TransDate?: string
  CreatedByUserId?: string
  DataAreaId?: string
  JournalPostingStatus?: string
  InventJournalLines?: RawD365InventJournalLine[]
  [key: string]: unknown
}

function mapReason(journalType: string | undefined, description: string | undefined): StockAdjustmentReason {
  const jt = (journalType ?? '').toLowerCase()
  const desc = (description ?? '').toLowerCase()
  if (jt === 'stockcount' || desc.includes('count')) return 'cycle_count'
  if (desc.includes('damage') || desc.includes('damag')) return 'damage'
  if (desc.includes('theft') || desc.includes('steal')) return 'theft'
  if (desc.includes('lost') || desc.includes('loss')) return 'lost'
  if (desc.includes('found')) return 'found'
  if (desc.includes('expir')) return 'expiration'
  if (desc.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawD365InventJournal): StockAdjustment {
  // Use the warehouse from the first line if the header has no single location
  const firstLine = raw.InventJournalLines?.[0]
  const locationId = pickStr(firstLine?.WarehouseId) ?? ''

  return {
    id: raw.JournalNumber,
    externalId: raw.JournalNumber,
    locationId,
    reason: mapReason(raw.JournalType, raw.Description),
    lines: (raw.InventJournalLines ?? []).map((l) => ({
      productId: l.ItemNumber,
      deltaQuantity: pickNum(l.Quantity) ?? 0,
      countedQuantity: pickNum(l.CorrectionQuantity),
      notes: pickStr(l.JournalLineDescription),
    })),
    adjustedAt: toIso(raw.TransDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.CreatedByUserId),
    platform: 'dynamics-365-scm',
    metadata: strMap({
      journalType: raw.JournalType,
      journalPostingStatus: raw.JournalPostingStatus,
      dataAreaId: raw.DataAreaId,
      description: raw.Description,
    }),
    raw,
  }
}
