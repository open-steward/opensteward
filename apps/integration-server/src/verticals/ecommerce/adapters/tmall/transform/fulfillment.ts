/**
 * Tmall / TOP logistics order (`Shipping`) → canonical Fulfillment.
 *
 * Source: `taobao.logistics.orders.get` (批量查询物流订单,
 * https://open.taobao.com/api.htm?docId=235&docType=2). Its response is
 * `shippings` ("获取的物流订单详情列表"), each a `Shipping` carrying only the
 * fields named in the request's `fields`.
 *
 * Fulfillment id: `${tid}:${order_code}`. `order_code` is the logistics order
 * number ("物流订单编号"), which identifies one logistics order; `tid` is kept
 * in the id because the only documented way to read a logistics order back is
 * `taobao.logistics.orders.get` filtered by `tid` ("交易ID.如果加入tid参数的话,
 * 不用传其他的参数"), which answers every logistics order of that trade (more
 * than one when the trade is split).
 *
 * Status mapping, from the documented `Shipping.status` values ("物流订单状态,
 * 可选值:CREATED(订单已创建) RECREATED(订单重新创建) CANCELLED(订单已取消)
 * CLOSED(订单关闭) SENDING(等候发送给物流公司) ACCEPTING(已发送给物流公司,等待接单)
 * ACCEPTED(物流公司已接单) REJECTED(物流公司不接单) PICK_UP(物流公司揽收成功)
 * PICK_UP_FAILED(物流公司揽收失败) LOST(物流公司丢单) REJECTED_BY_RECEIVER(对方拒签)
 * ACCEPTED_BY_RECEIVER(发货方式在线下单：对方已签收；自己联系：卖家已发货)"):
 *   CREATED, RECREATED, SENDING, ACCEPTING      → PENDING   (not yet with a carrier)
 *   ACCEPTED                                    → OPEN      (carrier accepted, not picked up)
 *   PICK_UP, ACCEPTED_BY_RECEIVER               → SUCCESS   (picked up / delivered or shipped)
 *   CANCELLED, CLOSED                           → CANCELLED
 *   REJECTED, PICK_UP_FAILED, LOST, REJECTED_BY_RECEIVER → FAILURE
 *   anything else                               → unknown
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw shape (documented `Shipping` fields this adapter requests) ────────────

export interface RawTmallShipping {
  /** 交易ID */
  tid?: number | string
  /** 物流订单编号 */
  order_code?: string
  /** 运单号.具体一个物流公司的运单号码. */
  out_sid?: string
  /** 物流公司名称 */
  company_name?: string
  /** 物流订单状态 */
  status?: string
  /** 运单创建时间 */
  created?: string
  /** 运单修改时间 */
  modified?: string
  /** 卖家是否确认发货.可选值:yes(是),no(否). */
  seller_confirm?: string
  [key: string]: unknown
}

/** The `fields` sent to `taobao.logistics.orders.get`, each from its documented list. */
export const SHIPPING_FIELDS =
  'tid,order_code,out_sid,company_name,status,created,modified,seller_confirm'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a documented `Shipping.status` to the canonical FulfillmentStatus. */
export function mapShippingStatus(status: string | undefined): FulfillmentStatus | undefined {
  if (status === undefined || status === '') return undefined
  switch (status) {
    case 'CREATED':
    case 'RECREATED':
    case 'SENDING':
    case 'ACCEPTING':
      return 'PENDING'
    case 'ACCEPTED':
      return 'OPEN'
    case 'PICK_UP':
    case 'ACCEPTED_BY_RECEIVER':
      return 'SUCCESS'
    case 'CANCELLED':
    case 'CLOSED':
      return 'CANCELLED'
    case 'REJECTED':
    case 'PICK_UP_FAILED':
    case 'LOST':
    case 'REJECTED_BY_RECEIVER':
      return 'FAILURE'
    default:
      return 'unknown'
  }
}

/** The canonical fulfillment id for one logistics order. */
export function shippingFulfillmentId(tid: number | string, orderCode: string): string {
  return `${String(tid)}:${orderCode}`
}

/**
 * Split a fulfillment id into `tid` and `order_code`. The tid is TOP's numeric
 * trade id, so the first `:` separates the two.
 */
export function parseShippingFulfillmentId(
  id: string,
): { tid: string; orderCode: string } | undefined {
  const at = id.indexOf(':')
  if (at <= 0 || at === id.length - 1) return undefined
  const tid = id.slice(0, at)
  if (!/^\d+$/.test(tid)) return undefined
  return { tid, orderCode: id.slice(at + 1) }
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * TOP `Shipping` → canonical Fulfillment. Throws when `tid` or `order_code`
 * is missing: both are requested, and without them the id cannot be read back.
 */
export function transformFulfillment(raw: RawTmallShipping): Fulfillment {
  if (raw.tid === undefined || raw.tid === null || raw.tid === '') {
    throw new Error('Tmall logistics order has no tid')
  }
  if (!raw.order_code) {
    throw new Error(`Tmall logistics order for tid ${String(raw.tid)} has no order_code`)
  }
  const status = mapShippingStatus(raw.status)
  const createdAt = toIsoDatetime(raw.created)
  const updatedAt = toIsoDatetime(raw.modified)
  return {
    id: shippingFulfillmentId(raw.tid, raw.order_code),
    orderId: String(raw.tid),
    ...(status ? { status } : {}),
    ...(raw.out_sid ? { trackingNumber: raw.out_sid } : {}),
    ...(raw.company_name ? { carrier: raw.company_name } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
