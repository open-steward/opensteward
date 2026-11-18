/**
 * Transform a VARIO Cloud stock-journal entry of type DOCUMENT or PICKING
 * (GET /erp/stocks/stockjournal) into the canonical StockTransfer schema.
 *
 * VARIO stock transfers appear in the journal as DOCUMENT or PICKING entries.
 * A single journal entry records one side of a movement; there are no separate
 * source/target storage fields on the StockJournal object — the storage is
 * identified by storageBinId.
 *
 * Field mapping (per erp-stock-StockJournal schema):
 *   id            ← id
 *   articleId     → lines[].productId
 *   storageBinId  → toLocationId  (the storage bin that was booked)
 *   factor        → sign of quantity (INCREMENT = inbound, DECREMENT = outbound)
 *   quantity      → lines[].quantity
 *   valueDate     → shippedAt / receivedAt
 *   type          → status
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawVarioStockJournalEntry {
  id?: string | number
  articleId?: string | number
  storageBinId?: string | number
  quantity?: number
  /** INCREMENT | DECREMENT | NONE */
  factor?: string
  valueDate?: string
  type?: string
  note?: string
  productNumber?: string
  documentNumber?: string
  documentType?: string
  cancellation?: boolean
  [key: string]: unknown
}

function mapStatus(type: string | undefined): StockTransferStatus {
  const t = (type ?? '').toUpperCase()
  if (t === 'PICKING') return 'in_transit'
  if (t === 'DOCUMENT' || t === 'RESTOCKING') return 'completed'
  return 'completed'
}

export function transformStockTransfer(raw: RawVarioStockJournalEntry): StockTransfer {
  const id = String(raw.id ?? '')
  const productId = pickStr(raw.articleId) ?? ''
  // storageBinId is the only storage reference on a journal entry
  const toLocationId = pickStr(raw.storageBinId) ?? ''
  // DECREMENT means stock left this location — model fromLocationId accordingly
  const isOutbound = (raw.factor ?? '').toUpperCase() === 'DECREMENT'
  const fromLocationId = isOutbound ? toLocationId : ''
  const resolvedToLocationId = isOutbound ? '' : toLocationId

  return {
    id,
    externalId: id,
    number: pickStr(raw.documentNumber),
    fromLocationId,
    toLocationId: resolvedToLocationId,
    status: mapStatus(raw.type),
    lines: [
      {
        productId,
        quantity: raw.quantity ?? 0,
        quantityReceived: raw.quantity,
      },
    ],
    shippedAt: toIso(raw.valueDate),
    receivedAt: toIso(raw.valueDate),
    platform: 'vario-software',
    metadata: strMap({ type: raw.type, note: raw.note, documentType: raw.documentType }),
    raw,
  }
}
