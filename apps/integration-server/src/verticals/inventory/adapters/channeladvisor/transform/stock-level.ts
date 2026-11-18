/**
 * Transform ChannelAdvisor DCQuantity entity -> canonical StockLevel.
 *
 * ChannelAdvisor exposes inventory at the distribution-center (DC) level.
 * DCQuantities are fetched by expanding products:
 *   GET /v1/Products?$expand=DCQuantities
 * or directly per product:
 *   GET /v1/Products({id})/DCQuantities
 *
 * Fields (from ChannelAdvisor DC Quantity entity):
 *   ProductID, ProfileID, DistributionCenterID, AvailableQuantity
 */
import type { StockLevel } from '../../../schema/stock-level'
import {strMap} from './shared'

export interface RawChannelAdvisorDCQuantity {
  ProductID?: number | string
  ProfileID?: number | string
  DistributionCenterID?: number | string
  AvailableQuantity?: number
  [key: string]: unknown
}

export function transformStockLevel(raw: RawChannelAdvisorDCQuantity): StockLevel {
  const productId = String(raw.ProductID ?? '')
  const locationId = String(raw.DistributionCenterID ?? '')
  return {
    id: `${productId}:${locationId}`,
    productId,
    locationId,
    // ChannelAdvisor only exposes AvailableQuantity at DC level
    quantityOnHand: raw.AvailableQuantity ?? 0,
    quantityAvailable: raw.AvailableQuantity,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: undefined,
    platform: 'channeladvisor',
    metadata: strMap({ profileId: raw.ProfileID }),
    raw,
  }
}
