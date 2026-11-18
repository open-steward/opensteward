/**
 * Virto Commerce InventoryInfo → canonical InventoryLevel.
 *
 * Docs: live demo Swagger, `VirtoCommerce.Inventory/swagger.json` →
 * `components.schemas.InventoryInfo`. There is no id scoped to a single
 * product+fulfillment-center pair, so one is synthesized as
 * `${productId}:${fulfillmentCenterId}`, per the canonical schema's own
 * guidance for platforms that don't expose a stable id.
 *
 * `inStockQuantity` is required to compute the required `available` field —
 * a record with none throws rather than reporting a fabricated zero.
 * `reservedQuantity`/`preorderQuantity`/`backorderQuantity` are genuinely
 * optional on the raw schema; `committed`/`incoming` are left unset (not
 * defaulted to 0) when none of the inputs they derive from were reported.
 */
import type { InventoryLevel } from '../../../schema/inventory'

export interface RawVirtoInventoryInfo {
  productId: string
  fulfillmentCenterId: string
  inStockQuantity?: number
  reservedQuantity?: number
  preorderQuantity?: number
  backorderQuantity?: number
  allowBackorder?: boolean
  allowPreorder?: boolean
  modifiedDate?: string
  [key: string]: unknown
}

export function transformInventoryLevel(raw: RawVirtoInventoryInfo): InventoryLevel {
  if (raw.inStockQuantity == null) {
    throw new Error(
      `Virto Commerce inventory record for product ${raw.productId} at fulfillment center ` +
        `${raw.fulfillmentCenterId} has no inStockQuantity — cannot report a valid available count.`,
    )
  }
  const onHand = raw.inStockQuantity
  const committed = raw.reservedQuantity
  const available = Math.max(0, onHand - (committed ?? 0))
  const incoming =
    raw.preorderQuantity != null || raw.backorderQuantity != null
      ? (raw.preorderQuantity ?? 0) + (raw.backorderQuantity ?? 0)
      : undefined
  return {
    id: `${raw.productId}:${raw.fulfillmentCenterId}`,
    variantId: raw.productId,
    locationId: raw.fulfillmentCenterId,
    available,
    committed,
    incoming,
    onHand,
    updatedAt: raw.modifiedDate,
    metadata: { ...raw },
  }
}
