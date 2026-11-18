/**
 * Transform SYSPRO InvMovements (transfer type) OData entity
 * → canonical StockTransfer.
 *
 * SYSPRO inter-warehouse transfers are recorded in InvMovements with
 * MovementType = 'TRF'. The same journal appears twice: once as a negative
 * issue from the source warehouse and once as a positive receipt at the
 * destination. The adapter pairs them on Journal (SourceJournal) number.
 *
 * Because a single OData row covers only one leg, this transform treats
 * each row as a transfer line grouped by journal. The index.ts adapter
 * groups by Journal after fetching.
 *
 * Confirmed field names (InvMovements):
 *   Journal, EntryDate, TransactionDate, Warehouse, StockCode,
 *   MovementQty, MovementType, Reference, Operator, SourceJournal
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSysproTransferRow {
  Journal?: string | number
  EntryDate?: string
  TransactionDate?: string
  Warehouse?: string
  StockCode?: string
  MovementQty?: number
  MovementType?: string
  Reference?: string
  Operator?: string
  SourceJournal?: string | number
  [key: string]: unknown
}

/** Grouped transfer: negative leg = source, positive leg = destination */
export interface RawSysproStockTransfer {
  /** Transfer journal / reference number */
  id: string
  fromWarehouse: string
  toWarehouse: string
  transactionDate?: string
  reference?: string
  lines: Array<{ stockCode: string; qty: number }>
  [key: string]: unknown
}

function mapStatus(_raw: RawSysproStockTransfer): StockTransferStatus {
  // SYSPRO does not expose a transfer status in InvMovements — a posted
  // movement row means the transfer completed.
  return 'completed'
}

export function transformStockTransfer(raw: RawSysproStockTransfer): StockTransfer {
  return {
    id: raw.id,
    externalId: raw.id,
    number: raw.id,
    fromLocationId: raw.fromWarehouse,
    toLocationId: raw.toWarehouse,
    status: mapStatus(raw),
    lines: raw.lines.map((l) => ({
      productId:        l.stockCode,
      quantity:         l.qty,
      quantityReceived: l.qty, // transfer is posted = already received
    })),
    shippedAt: toIso(raw.transactionDate),
    receivedAt: toIso(raw.transactionDate),
    platform: 'syspro',
    metadata: strMap({
      reference: raw.reference,
    }),
    raw,
  }
}

/**
 * Group raw InvMovements TRF rows into paired stock-transfer objects.
 * Negative qty row = source (issue); positive qty row = destination (receipt).
 */
export function groupTransferRows(rows: RawSysproTransferRow[]): RawSysproStockTransfer[] {
  const map = new Map<string, { neg?: RawSysproTransferRow; pos?: RawSysproTransferRow; lines: Map<string, number> }>()

  for (const row of rows) {
    const key = String(row.SourceJournal ?? row.Journal ?? '')
    if (!key) continue
    if (!map.has(key)) map.set(key, { lines: new Map() })
    const entry = map.get(key)!
    const qty = row.MovementQty ?? 0
    if (qty < 0) {
      entry.neg = row
    } else {
      entry.pos = row
    }
    if (row.StockCode) {
      entry.lines.set(row.StockCode, Math.abs(qty))
    }
  }

  const transfers: RawSysproStockTransfer[] = []
  for (const [key, entry] of map.entries()) {
    const from = entry.neg?.Warehouse ?? ''
    const to   = entry.pos?.Warehouse ?? ''
    const date = entry.pos?.TransactionDate ?? entry.pos?.EntryDate ?? entry.neg?.TransactionDate
    const lines: Array<{ stockCode: string; qty: number }> = []
    for (const [stockCode, qty] of entry.lines.entries()) {
      lines.push({ stockCode, qty })
    }
    transfers.push({
      id: key,
      fromWarehouse: from,
      toWarehouse: to,
      transactionDate: date,
      reference: pickStr(entry.pos?.Reference ?? entry.neg?.Reference),
      lines,
    })
  }

  return transfers
}
