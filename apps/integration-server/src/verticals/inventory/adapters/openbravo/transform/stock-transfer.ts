/**
 * Openbravo InternalMovement → canonical StockTransfer.
 *
 * Entity: InternalMovement (table: M_Movement)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/InternalMovement
 *
 * An InternalMovement records movement of stock between two storage bins /
 * warehouses within the same organisation.
 *
 * Status lifecycle:
 *   DR (Draft) → CO (Processed/Completed) → VO (Voided)
 *
 * Fields used:
 *   id, documentNo, documentStatus, movementDate, processDate,
 *   internalMovementLineList (product.id, movementQty, storagebin.id,
 *   newStorageBin.id, quantityReceived)
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOpenbravoMovementLine {
  id: string
  product?: { id?: string }
  /** Source bin */
  storagebin?: { id?: string; warehouse?: { id?: string } }
  /** Destination bin */
  newStorageBin?: { id?: string; warehouse?: { id?: string } }
  movementQty?: number | string
  quantityReceived?: number | string
  [key: string]: unknown
}

export interface RawOpenbravoInternalMovement {
  /** UUID primary key */
  id: string
  documentNo?: string
  /** DR=Draft, CO=Completed, VO=Voided */
  documentStatus?: string
  movementDate?: string
  processDate?: string
  internalMovementLineList?: RawOpenbravoMovementLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DR':
      return 'draft'
    case 'CO':
      return 'completed'
    case 'VO':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawOpenbravoInternalMovement): StockTransfer {
  const lines = raw.internalMovementLineList ?? []

  // Derive from/to at the header level from the first line (consistent within a movement)
  const firstLine = lines[0]
  const fromLocationId = firstLine?.storagebin?.id ?? ''
  const toLocationId = firstLine?.newStorageBin?.id ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.documentNo),
    fromLocationId,
    toLocationId,
    status: mapStatus(raw.documentStatus),
    lines: lines.map((l) => ({
      productId: l.product?.id ?? '',
      quantity: pickNum(l.movementQty) ?? 0,
      quantityReceived: pickNum(l.quantityReceived),
    })),
    shippedAt: toIso(raw.movementDate),
    receivedAt: toIso(raw.processDate),
    platform: 'openbravo',
    metadata: strMap({ documentStatus: raw.documentStatus }),
    raw,
  }
}
