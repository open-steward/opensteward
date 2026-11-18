/**
 * Maps Norce Commerce Query's `Order` entity (Orders/Orders) to the
 * canonical Order shape. Field names verbatim from the published OpenAPI
 * schema for `Enferno.Storm.Query.Api.DataContexts.OrderModel.Order`:
 * https://docs.norce.io/api-reference/query/queryorders/openapi
 *
 * Deliberately NOT mapped: `totalPrice` / `currency` / `financialStatus` /
 * `lineItems`. The Order entity's financial fields are itemised charges
 * (VatRate, CashDiscount, LineDiscount, FreightCost, OrderFee) with no
 * documented grand-total field, `CurrencyId` is an integer requiring a join
 * against Core's `Currency` entity for an ISO code, and `StatusId` is an
 * opaque integer with no published enum — none of these can be mapped
 * correctly from this endpoint alone, so they are left unset rather than
 * guessed. The raw record is always available via `metadata`.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Order } from '../../../schema/order'

export interface RawNorceOrder {
  Id: string
  OrderNo?: string | null
  OrderDate?: string | number | null
  Created?: string | number | null
  Updated?: string | number | null
  BuyerCustomerId?: number | null
  PayerCustomerId?: number | null
  [key: string]: unknown
}

export function transformOrder(raw: RawNorceOrder): Order {
  const customerId = raw.BuyerCustomerId ?? raw.PayerCustomerId
  return {
    id: String(raw.Id),
    orderNumber: raw.OrderNo ?? undefined,
    name: raw.OrderNo ?? undefined,
    customerId: customerId != null ? String(customerId) : undefined,
    createdAt: toIsoDatetime(raw.Created),
    updatedAt: toIsoDatetime(raw.Updated),
    processedAt: toIsoDatetime(raw.OrderDate),
    metadata: raw as Record<string, unknown>,
  }
}
