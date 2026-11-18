/**
 * Transform Unicommerce gatepass (type: STOCK_TRANSFER) → canonical StockTransfer.
 *
 * Source endpoint:
 *   POST /services/rest/v1/purchase/gatepass/get  → elements[]
 *
 * Only gatepasses with type=STOCK_TRANSFER are mapped. The "from" location is
 * the facility that issues the gatepass (credentials.extra.facility); the "to"
 * location is toPartyName (code) as Unicommerce returns a name not a code here.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawUnicommerceGatepassItem {
  itemCode?: string
  itemTypeSKU?: string
  itemTypeName?: string
  quantity?: number
  receivedQuantity?: number
  pendingQuantity?: number
  unitPrice?: number
  inventoryType?: string
  shelfCode?: string
  [key: string]: unknown
}

export interface RawUnicommerceGatepass {
  id?: number
  code?: string
  statusCode?: string
  type?: string
  invoiceCode?: string | null
  toPartyName?: string
  reference?: string
  purpose?: string
  created?: number | string
  updated?: number | string
  gatePassItemDTOs?: RawUnicommerceGatepassItem[]
  fromFacilityCode?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'CREATED': return 'draft'
    case 'RETURN_AWAITED': return 'in_transit'
    case 'CLOSED': return 'completed'
    case 'DISCARDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawUnicommerceGatepass): StockTransfer {
  const id = pickStr(raw.code) ?? String(raw.id ?? '')

  return {
    id,
    externalId: id,
    number: pickStr(raw.code),
    fromLocationId: pickStr(raw.fromFacilityCode) ?? '',
    toLocationId: pickStr(raw.toPartyName) ?? '',
    status: mapStatus(raw.statusCode),
    lines: (raw.gatePassItemDTOs ?? []).map((l) => ({
      productId: pickStr(l.itemTypeSKU) ?? pickStr(l.itemCode) ?? '',
      quantity: l.quantity ?? 0,
      quantityReceived: l.receivedQuantity,
    })),
    shippedAt: toIso(raw.created),
    receivedAt: raw.statusCode?.toUpperCase() === 'CLOSED' ? toIso(raw.updated) : undefined,
    platform: 'unicommerce',
    metadata: strMap({
      type: raw.type,
      purpose: raw.purpose,
      reference: raw.reference,
      invoiceCode: raw.invoiceCode,
    }),
    raw,
  }
}
