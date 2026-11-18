/**
 * Amazon SP-API shipment/fulfillment info → canonical Fulfillment.
 *
 * Amazon does not expose a standalone "fulfillment" resource the way
 * Shopify does. Instead, each OrderItem carries a `FulfillmentChannel`
 * (MFN = merchant-fulfilled, AFN = Amazon-fulfilled, i.e. FBA) and
 * shipping quantities. The adapter projects these onto the canonical
 * Fulfillment shape so that clients looking at `/fulfillments?orderId=X`
 * can still get a coarse view of what's shipped.
 *
 * Fulfillment id format: `${amazonOrderId}:${orderItemId}` — synthetic,
 * since Amazon does not hand us a per-shipment id in this namespace.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { RawAmazonOrderItem } from './order'

/**
 * Map Amazon's shipment state onto the canonical fulfillment status
 * enum. Amazon does not publish a clear `status` field per OrderItem,
 * so we compare ordered vs shipped quantity.
 */
function inferStatus(item: RawAmazonOrderItem): FulfillmentStatus {
  const ordered = item.QuantityOrdered
  const shipped = item.QuantityShipped ?? 0
  if (shipped === 0) return 'PENDING'
  if (shipped < ordered) return 'OPEN'
  return 'SUCCESS'
}

/**
 * Project one Amazon OrderItem into a canonical Fulfillment. Callers
 * that want a per-order list should iterate the OrderItems array and
 * pass each one through this function.
 */
export function transformFulfillment(
  orderId: string,
  item: RawAmazonOrderItem,
): Fulfillment {
  // Treat AFN (Amazon) vs MFN (merchant) as the "service" slot. The
  // canonical `carrier` field is not populated because Amazon does not
  // surface the carrier through this endpoint.
  const channel = (item['FulfillmentChannel'] as string | undefined) ?? undefined
  const service = channel === 'AFN' ? 'FBA' : channel === 'MFN' ? 'FBM' : undefined

  return {
    id: `${orderId}:${item.OrderItemId}`,
    orderId,
    status: inferStatus(item),
    service,
    lineItems: [
      {
        lineItemId: item.OrderItemId,
        quantity: item.QuantityShipped ?? 0,
      },
    ],
    metadata: {
      sellerSku: item.SellerSKU,
      asin: item.ASIN,
      quantityOrdered: item.QuantityOrdered,
      quantityShipped: item.QuantityShipped,
      raw: item,
    },
  }
}

/**
 * Build a fulfillment list for an entire order by projecting every
 * OrderItem through {@link transformFulfillment}. Items with zero
 * `QuantityShipped` are still included (as `PENDING`) so callers see
 * the full in-flight state.
 */
export function transformFulfillments(
  orderId: string,
  items: RawAmazonOrderItem[] | undefined,
): Fulfillment[] {
  if (!items || items.length === 0) return []
  return items.map((i) => transformFulfillment(orderId, i))
}
