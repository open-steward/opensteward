/**
 * Transform Restaurant365 OData `Transaction` (type="Item Transfer")
 * -> canonical StockTransfer.
 *
 * R365 represents inter-location item transfers as Transactions of type
 * "Item Transfer". The Transaction's locationId is the source; destination
 * is encoded in a TransactionDetail credit/debit pair or a secondary
 * location field. We surface what the API provides.
 *
 * OData fields used:
 * Transaction:
 *   transactionId     Guid
 *   transactionNumber String
 *   name              String
 *   type              String   — "Item Transfer"
 *   locationId        Guid     — source location
 *   date              DateTimeOffset
 *   isApproved        Boolean
 *   createdBy         String
 *
 * TransactionDetail (lines):
 *   transactionDetailId  Guid
 *   itemId               Guid
 *   quantity             Decimal
 *   credit               Decimal — positive on destination side
 *   debit                Decimal — positive on source side
 *   comment              String
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawR365TransferLine {
  transactionDetailId?: string
  itemId?: string
  quantity?: number
  credit?: number
  debit?: number
  comment?: string
  [key: string]: unknown
}

export interface RawR365TransferTransaction {
  transactionId: string
  transactionNumber?: string
  name?: string
  type?: string
  locationId?: string
  destinationLocationId?: string
  date?: string
  isApproved?: boolean
  createdBy?: string
  lines?: RawR365TransferLine[]
  [key: string]: unknown
}

function mapStatus(isApproved: boolean | undefined): StockTransferStatus {
  if (isApproved === true) return 'completed'
  if (isApproved === false) return 'draft'
  return 'draft'
}

export function transformStockTransfer(raw: RawR365TransferTransaction): StockTransfer {
  return {
    id: raw.transactionId,
    externalId: raw.transactionId,
    number: pickStr(raw.transactionNumber),
    fromLocationId: raw.locationId ?? '',
    toLocationId: pickStr(raw.destinationLocationId) ?? '',
    status: mapStatus(raw.isApproved),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId ?? '',
      quantity: l.quantity ?? Math.abs(l.debit ?? l.credit ?? 0),
      quantityReceived: undefined,
    })),
    shippedAt: toIso(raw.date),
    receivedAt: raw.isApproved ? toIso(raw.date) : undefined,
    platform: 'restaurant365',
    metadata: strMap({
      transactionNumber: raw.transactionNumber,
      name: raw.name,
      type: raw.type,
      createdBy: raw.createdBy,
    }),
    raw,
  }
}
