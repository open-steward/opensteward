import type { StockLevel } from '../../../schema/stock-level'
import { pickNum, pickStr, requireId, strMap } from './shared'

/**
 * Erplain v2 `StockLevel`, as selected by STOCK_LEVEL_FIELDS in ../index.ts.
 *
 * https://erplain.readme.io/v2.0/reference/stock-levels-queries, "Available fields":
 *   id            Int      "Unique identifier."
 *   on_hand       Float    "Physical quantity on hand."
 *   available     Float    "Quantity available for sale (on_hand - reserved)."
 *   incoming      Float    "Quantity ordered from suppliers (e.g. Purchase Orders)."
 *   reserved      Float    "Quantity reserved in active documents (e.g. Sales Orders)."
 *   reorder_point Float    "Reorder point configured for this location/variant."
 *   bin_location  String   "Bin location."
 *   to_reorder    Float    "Calculated quantity to reorder."
 *   location      Location "Associated location/warehouse."
 *   variant       Variant  "Associated product variant."
 *
 * A stock level belongs to a variant. The canonical productId is the variant's
 * parent product, `variant.product` ("Parent product link.",
 * https://erplain.readme.io/v2.0/reference/variants-queries), so it resolves
 * against the ids listProducts returns; the variant's own id and SKU go to
 * metadata. `to_reorder` is a computed suggestion, not the configured reorder
 * quantity the canonical reorderQuantity means, so it goes to metadata too.
 */
export interface RawErplainStockLevel {
  id: number | string
  on_hand?: number | null
  available?: number | null
  incoming?: number | null
  reserved?: number | null
  reorder_point?: number | null
  bin_location?: string | null
  to_reorder?: number | null
  location?: { id?: number | string | null; label?: string | null } | null
  variant?: {
    id?: number | string | null
    sku?: string | null
    product?: { id?: number | string | null } | null
  } | null
}

export function transformStockLevel(raw: RawErplainStockLevel): StockLevel {
  const id = requireId(raw.id, 'stock level')
  const productId = requireId(raw.variant?.product?.id, `stock level ${id} variant.product`)
  const locationId = requireId(raw.location?.id, `stock level ${id} location`)
  const onHand = pickNum(raw.on_hand)
  if (onHand === undefined) throw new Error(`erplain stock level ${id} has no on_hand`)
  return {
    id,
    externalId: id,
    productId,
    locationId,
    quantityOnHand: onHand,
    quantityAvailable: pickNum(raw.available),
    quantityCommitted: pickNum(raw.reserved),
    quantityIncoming: pickNum(raw.incoming),
    reorderPoint: pickNum(raw.reorder_point),
    platform: 'erplain',
    metadata: strMap({
      variant_id: pickStr(raw.variant?.id),
      variant_sku: raw.variant?.sku,
      location_label: raw.location?.label,
      bin_location: raw.bin_location,
      to_reorder: raw.to_reorder,
    }),
    raw,
  }
}
