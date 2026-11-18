/**
 * Transform Sage X3 MISREC (Miscellaneous Receipts / Inter-site Transfer)
 * representation to canonical StockTransfer.
 *
 * Sage X3 inter-site stock transfers are handled by the MISREC (miscellaneous
 * receipt) and/or the STOTRF (stock transfer) function.  The representation
 * used here is MISREC which covers both.
 *
 * Key fields:
 *   VCRNUM  — transfer / receipt voucher number (primary key)
 *   SIVFCY  — source site (from-warehouse)
 *   RCVFCY  — receiving site (to-warehouse)
 *   VCRDAT  — voucher / creation date
 *   SHIDAT  — shipment date
 *   RCPDAT  — receipt date
 *   VCRSTA  — status: '1'=Draft, '2'=In-progress/Shipped, '3'=Completed, '9'=Cancelled
 *
 * Lines (MISRECL / STOTRF sub-table):
 *   ITMREF  — product reference
 *   QTYSTU  — transfer quantity
 *   RCPQTY  — received quantity
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawSageX3StockTransferLine {
  ITMREF?: string
  QTYSTU?: number | string
  RCPQTY?: number | string
  [key: string]: unknown
}

export interface RawSageX3StockTransfer {
  /** Voucher number — primary key */
  VCRNUM?: string
  /** Source site */
  SIVFCY?: string
  /** Receiving site */
  RCVFCY?: string
  /** Voucher / creation date */
  VCRDAT?: string
  /** Shipment date */
  SHIDAT?: string
  /** Receipt date */
  RCPDAT?: string
  /** Status: '1'=Draft,'2'=Shipped/In-transit,'3'=Received/Completed,'9'=Cancelled */
  VCRSTA?: string | number
  /** Lines as object array */
  MISRECL?: RawSageX3StockTransferLine[]
  /** Parallel arrays form */
  MISRECL_ITMREF?: string[]
  MISRECL_QTYSTU?: Array<number | string>
  MISRECL_RCPQTY?: Array<number | string>
  [key: string]: unknown
}

function mapStatus(vcrsta: string | number | undefined): StockTransferStatus {
  switch (String(vcrsta ?? '1').trim()) {
    case '1': return 'draft'
    case '2': return 'in_transit'
    case '3': return 'completed'
    case '9': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSageX3StockTransfer): StockTransfer {
  const id = pickStr(raw.VCRNUM) ?? ''

  let lines: StockTransfer['lines'] = []
  if (Array.isArray(raw.MISRECL) && raw.MISRECL.length > 0) {
    lines = raw.MISRECL.map((l) => ({
      productId: pickStr(l.ITMREF) ?? '',
      quantity: pickNum(l.QTYSTU) ?? 0,
      quantityReceived: pickNum(l.RCPQTY),
    }))
  } else if (Array.isArray(raw.MISRECL_ITMREF)) {
    lines = raw.MISRECL_ITMREF.map((itmref, i) => ({
      productId: pickStr(itmref) ?? '',
      quantity: pickNum(raw.MISRECL_QTYSTU?.[i]) ?? 0,
      quantityReceived: pickNum(raw.MISRECL_RCPQTY?.[i]),
    }))
  }

  return {
    id,
    externalId: id,
    number: id,
    fromLocationId: pickStr(raw.SIVFCY) ?? '',
    toLocationId: pickStr(raw.RCVFCY) ?? '',
    status: mapStatus(raw.VCRSTA),
    lines,
    shippedAt: toIso(raw.SHIDAT) ?? toIso(raw.VCRDAT),
    receivedAt: toIso(raw.RCPDAT),
    platform: 'sage-x3-inventory',
    metadata: strMap({ vcrsta: raw.VCRSTA, vcrdat: raw.VCRDAT }),
    raw,
  }
}
