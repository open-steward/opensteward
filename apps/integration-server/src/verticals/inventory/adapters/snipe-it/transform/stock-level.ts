/**
 * Snipe-IT stock level derivation from a hardware asset.
 *
 * Snipe-IT does not expose an explicit stock-on-hand endpoint.
 * Each hardware asset is an individual unit; we synthesise a StockLevel of
 * qty=1 at the asset's current location.  The composite id is
 * "asset:<assetId>:<locationId>" to stay unique.
 *
 * This transform is intentionally called from listStockLevels (which
 * pages /hardware), not from a dedicated stock endpoint.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap, toIso} from './shared'
import type { RawSnipeItAsset } from './product'

function extractDate(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return toIso(v)
  const obj = v as Record<string, unknown>
  return toIso(obj['datetime'] ?? obj['formatted'])
}

export function transformStockLevel(raw: RawSnipeItAsset): StockLevel {
  const assetId = String(raw.id)
  const locationId = raw.location?.id != null ? String((raw.location as { id: number }).id) : ''

  return {
    id: `asset:${assetId}:${locationId}`,
    productId: assetId,
    locationId,
    quantityOnHand: 1,
    quantityAvailable: raw.status_label?.status_meta === 'deployable' ? 1 : 0,
    lastCountedAt: extractDate(raw.last_audit_date),
    platform: 'snipe-it',
    metadata: strMap({
      assetTag: raw.asset_tag,
      statusMeta: raw.status_label?.status_meta,
      statusType: raw.status_label?.status_type,
    }),
    raw,
  }
}
