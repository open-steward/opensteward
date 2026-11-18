/**
 * iQmetrix Inventory Adjustments API — stock-adjustment transform.
 *
 * Source: POST /rqinventoryadjustment/Companies/{CompanyId}/QuantityAdjustment
 *         (write-only — no public list/get endpoint documented)
 *
 * The API creates quantity adjustments in the RQ POS system.  We model the
 * raw shape from the documented request body so the transform can be used
 * to normalise data from other iQmetrix data sources (e.g. DataConnect).
 *
 * Key request fields:
 *   QuantityAdjustmentGuid  — UUID (our id)
 *   StoreEntityId           — integer location ID
 *   EmployeeEntityId        — optional integer user ID
 *   Products                — array of { VendorSKU, CatalogItemId, Quantity, ReasonCode, UnitCost }
 *
 * ReasonCode is an integer from the ReasonCodes lookup via Data Connect.
 * We map common iQmetrix reason text where available, defaulting to 'other'.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawIqmetrixStockAdjustment {
  QuantityAdjustmentGuid?: string
  StoreEntityId?: number
  EmployeeEntityId?: number
  /** Optional ISO timestamp for when the adjustment was recorded */
  AdjustmentDateUtc?: string
  Products?: Array<{
    VendorSKU?: string
    CatalogItemId?: string
    Quantity?: number
    ReasonCode?: number
    /** Optional human-readable reason text */
    ReasonDescription?: string
    UnitCost?: number
  }>
  [key: string]: unknown
}

function mapReasonCode(code: number | undefined, description: string | undefined): StockAdjustmentReason {
  const desc = (description ?? '').toLowerCase()
  if (desc.includes('count') || desc.includes('audit')) return 'cycle_count'
  if (desc.includes('damage') || desc.includes('defect')) return 'damage'
  if (desc.includes('theft') || desc.includes('steal') || desc.includes('shrink')) return 'theft'
  if (desc.includes('lost') || desc.includes('missing')) return 'lost'
  if (desc.includes('found')) return 'found'
  if (desc.includes('expir')) return 'expiration'
  if (desc.includes('correct') || desc.includes('adjust')) return 'correction'
  // iQmetrix standard reason codes (illustrative — actual codes from Data Connect)
  if (code === 1) return 'cycle_count'
  if (code === 2) return 'damage'
  if (code === 3) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawIqmetrixStockAdjustment): StockAdjustment {
  const id = pickStr(raw.QuantityAdjustmentGuid) ?? 'unknown'
  const locationId = raw.StoreEntityId !== undefined ? String(raw.StoreEntityId) : ''
  const adjustedBy = raw.EmployeeEntityId !== undefined ? String(raw.EmployeeEntityId) : undefined

  // Determine overall reason from first product line (adjustments typically share a reason)
  const firstProduct = raw.Products?.[0]
  const reason = mapReasonCode(firstProduct?.ReasonCode, firstProduct?.ReasonDescription)

  return {
    id,
    externalId:  id,
    locationId,
    reason,
    lines: (raw.Products ?? []).map((p) => ({
      productId:    pickStr(p.CatalogItemId) ?? pickStr(p.VendorSKU) ?? '',
      deltaQuantity: p.Quantity ?? 0,
      // UnitCost is in dollars — convert to minor units (cents)
      notes: p.ReasonDescription
        ?? (p.ReasonCode !== undefined ? `reasonCode:${p.ReasonCode}` : undefined),
    })),
    adjustedAt:  toIso(raw.AdjustmentDateUtc) ?? new Date(0).toISOString(),
    adjustedBy,
    platform:    'iqmetrix',
    metadata: strMap({ storeEntityId: raw.StoreEntityId, employeeEntityId: raw.EmployeeEntityId }),
    raw,
  }
}
