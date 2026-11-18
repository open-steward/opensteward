import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress } from '../../shared/transform'

// ─── Flash Express raw types ───────────────────────────────────────────────

/**
 * Response shape from POST /open/v3/orders.
 * Flash Express treats every shipment as an "order"; there is no separate
 * order-listing endpoint — orders are created and then managed by pno.
 */
export interface FlashExpressOrderResponse {
  pno: string
  mchId: string | null
  outTradeNo: string | null
  sortCode: string | null
  lineCode: string | null
  sortingLineCode: string | null
  dstStoreName: string | null
  earlyFlightEnabled: boolean | null
  packEnabled: boolean | null
  upcountry: boolean | null
  upcountryAmount: number | null
  upcountryCharge: boolean | null
  sameProvince: boolean | null
  notice: string | null
  srcPostalCode: string | null
  dstPostalCode: string | null
  subPno: string | null
  [key: string]: unknown
}

export interface FlashExpressCreateOrderRequest {
  sender?: Record<string, unknown>
  recipient?: Record<string, unknown>
  weight?: number
  weight_unit?: string
  service_code?: string
  reference?: string
  [key: string]: unknown
}

export interface FlashExpressCreateOrderEnvelope {
  code: number
  message: string
  tid?: string
  data: FlashExpressOrderResponse
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(_raw: FlashExpressOrderResponse): OrderStatus {
  // Flash Express does not return a status field on order creation;
  // a freshly-created order is always awaiting pickup.
  return 'AWAITING_SHIPMENT'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(
  raw: FlashExpressOrderResponse,
  requestBody?: FlashExpressCreateOrderRequest,
): Order {
  return {
    id: raw.pno,
    status: mapOrderStatus(raw),
    orderNumber: raw.outTradeNo ?? raw.pno,
    originAddress: requestBody?.sender ? toAddress(requestBody.sender) : undefined,
    destinationAddress: requestBody?.recipient ? toAddress(requestBody.recipient) : undefined,
    notes: raw.notice ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
