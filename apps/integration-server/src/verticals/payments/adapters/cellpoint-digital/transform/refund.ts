/**
 * Transform a CellPoint Digital (Velocity) refund result into a canonical Refund.
 *
 * The Velocity refund response is intentionally thin — it returns a numeric
 * `<code>` (1000 == success) plus an optional exception `<type>`/`<code>`. It
 * does NOT echo back the amount, currency, or a refund id. The adapter
 * therefore threads the request context (charge/transaction id, amount,
 * currency, order-no) into the transform so the canonical object is complete.
 *
 * Docs: https://documentation.cellpointdigital.com/docs/refund-void-copy
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { parseXml, child, text, toInt, pickCurrency, strMap, type XmlNode } from './shared'
import { STATUS_CODES } from '../constants'

export interface RefundContext {
  /** The original transaction id being refunded (canonical chargeId). */
  chargeId: string
  /** Refund amount in minor units (smallest currency unit). */
  amount?: number
  /** ISO 4217 currency. */
  currency?: string
  /** The merchant order number, if supplied. */
  orderNo?: string
}

function mapStatus(code: number | undefined): RefundStatus {
  if (code === STATUS_CODES.operationSuccess) return 'succeeded'
  if (code === undefined) return 'pending'
  return 'failed'
}

/**
 * @param input  The raw refund response XML (or an already-parsed node).
 * @param ctx    Request context threaded in by the adapter (amount/currency/ids).
 */
export function transformRefund(input: XmlNode | string, ctx: RefundContext): Refund {
  const root = typeof input === 'string' ? parseXml(input) : input
  // The response code can live at the root <code> or under a wrapper.
  const code = toInt(text(root, 'code')) ?? toInt(text(child(root, 'reversal'), 'code'))
  const exception = child(root, 'exception') ?? (text(root, 'type') ? root : undefined)
  const exceptionMessage = text(exception, 'message') ?? text(root, 'type')

  return {
    id: ctx.chargeId,
    externalId: ctx.chargeId,
    chargeId: ctx.chargeId,
    amount: ctx.amount ?? 0,
    currency: pickCurrency(ctx.currency),
    status: mapStatus(code),
    failureReason: code !== STATUS_CODES.operationSuccess ? exceptionMessage : undefined,
    gateway: 'cellpoint-digital',
    metadata: strMap({
      'order-no': ctx.orderNo,
      code: code != null ? String(code) : undefined,
    }),
    createdAt: undefined,
    updatedAt: undefined,
    raw: root,
  }
}
