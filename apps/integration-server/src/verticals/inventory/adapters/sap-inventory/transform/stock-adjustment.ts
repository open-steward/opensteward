/**
 * Transform SAP API_MATERIAL_DOCUMENT_SRV MaterialDocumentItem → canonical StockAdjustment.
 *
 * SAP represents inventory adjustments as Material Documents (Goods Movements).
 * Relevant movement types for adjustments:
 *   201 — goods issue for cost center (negative)
 *   202 — reversal of 201
 *   551 — scrapping (negative)
 *   552 — reversal of scrapping
 *   701 — physical inventory surplus (positive)
 *   702 — physical inventory deficit (negative)
 *   711 — physical inventory difference (positive)
 *   712 — physical inventory difference (negative)
 *
 * Entity: A_MaterialDocumentItem (within API_MATERIAL_DOCUMENT_SRV)
 * Header: A_MaterialDocumentHeader
 *
 * Key header fields:
 *   MaterialDocument, MaterialDocumentYear, PostingDate, DocumentDate,
 *   CreatedByUser, ReferenceDocument
 *
 * Key item fields:
 *   MaterialDocumentItem, Material, Plant, StorageLocation,
 *   GoodsMovementType, QuantityInBaseUnit, BaseUnit,
 *   GoodsMovementReasonCode, IsCompletelyReversed
 *
 * Reference: https://api.sap.com/api/API_MATERIAL_DOCUMENT_SRV/resource
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

interface RawSapMatDocItem {
  MaterialDocumentItem?: string
  Material?: string
  Plant?: string
  StorageLocation?: string
  /** Movement type: "551", "701", etc. */
  GoodsMovementType?: string
  QuantityInBaseUnit?: string | number
  BaseUnit?: string
  GoodsMovementReasonCode?: string
  IsCompletelyReversed?: boolean | string
  [key: string]: unknown
}

/** Raw SAP A_MaterialDocumentHeader (with expanded items) */
export interface RawSapStockAdjustment {
  MaterialDocument: string
  MaterialDocumentYear?: string
  PostingDate?: string
  DocumentDate?: string
  CreatedByUser?: string
  ReferenceDocument?: string
  /** Expanded item lines */
  to_MaterialDocumentItem?: { results?: RawSapMatDocItem[] } | RawSapMatDocItem[]
  [key: string]: unknown
}

/**
 * Map SAP GoodsMovementType + GoodsMovementReasonCode to canonical reason.
 *
 * Movement type groups:
 *   551–556  scrapping / write-off → damage or other
 *   701–712  physical inventory   → cycle_count or correction
 *   201–202  cost-centre issue    → other
 */
function mapReason(
  movementType: string | undefined,
  reasonCode: string | undefined,
): StockAdjustmentReason {
  const mt = (movementType ?? '').trim()
  const rc = (reasonCode ?? '').trim()

  // Physical inventory movement types
  if (['701', '702', '711', '712'].includes(mt)) return 'cycle_count'
  // Scrapping
  if (['551', '552', '553', '554', '555', '556'].includes(mt)) return 'damage'
  // Reason code hints
  if (rc) {
    const rLow = rc.toLowerCase()
    if (rLow.includes('damage')) return 'damage'
    if (rLow.includes('theft') || rLow.includes('steal')) return 'theft'
    if (rLow.includes('expir')) return 'expiration'
    if (rLow.includes('lost') || rLow.includes('loss')) return 'lost'
    if (rLow.includes('found')) return 'found'
    if (rLow.includes('correct')) return 'correction'
    if (rLow.includes('count')) return 'cycle_count'
  }
  return 'other'
}

/** Goods movements that increase stock have even movement types (reversal); */
function isPositiveMovement(movementType: string | undefined): boolean {
  const mt = parseInt(movementType ?? '0', 10)
  if (Number.isNaN(mt)) return false
  // SAP convention: odd = outbound, even = inbound/reversal for paired types
  // Physical inventory: 701 = surplus (positive), 702 = deficit (negative)
  if (mt === 701 || mt === 711) return true
  if (mt === 702 || mt === 712) return false
  return mt % 2 === 0
}

function extractItems(raw: RawSapStockAdjustment): RawSapMatDocItem[] {
  const nav = raw.to_MaterialDocumentItem
  if (!nav) return []
  if (Array.isArray(nav)) return nav
  return nav.results ?? []
}

export function transformStockAdjustment(raw: RawSapStockAdjustment): StockAdjustment {
  const items = extractItems(raw)

  // Use plant:storageLocation of first item as primary locationId
  const firstItem = items[0]
  const plant = pickStr(firstItem?.Plant) ?? ''
  const sloc = pickStr(firstItem?.StorageLocation) ?? ''
  const locationId = sloc ? `${plant}:${sloc}` : plant

  const lines = items.map((item) => {
    const mt = pickStr(item.GoodsMovementType)
    const rawQty = pickNum(item.QuantityInBaseUnit) ?? 0
    const delta = isPositiveMovement(mt) ? rawQty : -rawQty

    return {
      productId: pickStr(item.Material) ?? '',
      deltaQuantity: delta,
      countedQuantity: undefined,
      notes: item.GoodsMovementReasonCode
        ? `MovType:${mt} Reason:${item.GoodsMovementReasonCode}`
        : pickStr(mt) ? `MovType:${mt}` : undefined,
    }
  })

  // Derive overall reason from most-represented movement type
  const reasonSample = firstItem
  const reason = mapReason(
    pickStr(reasonSample?.GoodsMovementType),
    pickStr(reasonSample?.GoodsMovementReasonCode),
  )

  return {
    id: `${raw.MaterialDocument}:${raw.MaterialDocumentYear ?? ''}`,
    externalId: `${raw.MaterialDocument}:${raw.MaterialDocumentYear ?? ''}`,
    locationId,
    reason,
    lines,
    adjustedAt: toIso(raw.PostingDate) ?? toIso(raw.DocumentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.CreatedByUser),
    platform: 'sap-inventory',
    metadata: strMap({
      materialDocument: raw.MaterialDocument,
      materialDocumentYear: raw.MaterialDocumentYear,
      referenceDocument: raw.ReferenceDocument,
    }),
    raw,
  }
}
