/**
 * Mirakl RT11 return → canonical Refund.
 *
 * RT11 (GET /api/returns) lists buyer returns. Its documented item fields
 * (https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/returns/rt11.md)
 * include `data.id` ("Return id", required), `data.order_id` ("Order id",
 * required), `data.date_created` ("Return creation date", required),
 * `data.last_updated` (required), `data.state` (required), `data.reason_code`,
 * `data.description` and `data.return_lines` (required) with
 * `order_line_id` and `quantity` (both required).
 *
 * Mapping:
 *  - `id`                         → Refund.id
 *  - `order_id`                   → Refund.orderId
 *  - `reason_code`                → Refund.reason
 *  - `description`                → Refund.note
 *  - `return_lines[].order_line_id` / `quantity` → Refund.refundLineItems
 *  - `date_created`               → Refund.createdAt
 *
 * RT11 documents no amount and no refund/processing date, so `amount`,
 * `processedAt` and `restock` are left unset. The raw return (with `state`,
 * `order_commercial_id`, `last_updated`) goes to metadata.
 */

import type { Refund, RefundLineItem } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Mirakl RT11 shapes ────────────────────────────────────────────────────

export interface RawMiraklReturnLine {
  order_line_id?: string | null
  quantity?: number | null
  reason_code?: string | null
  compliance?: unknown[] | null
  [key: string]: unknown
}

export interface RawMiraklReturn {
  id?: string | null
  order_id?: string | null
  order_commercial_id?: string | null
  date_created?: string | null
  last_updated?: string | null
  state?: string | null
  reason_code?: string | null
  description?: string | null
  return_lines?: RawMiraklReturnLine[] | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapLines(
  returnId: string,
  lines: RawMiraklReturnLine[] | null | undefined,
): RefundLineItem[] | undefined {
  if (!lines) return undefined
  return lines.map((l, i) => {
    if (!l.order_line_id || typeof l.quantity !== 'number') {
      throw new Error(
        `Mirakl return '${returnId}': return_lines[${i}] is missing its required order_line_id or quantity`,
      )
    }
    return { lineItemId: l.order_line_id, quantity: l.quantity }
  })
}

export function transformReturn(raw: RawMiraklReturn): Refund {
  if (!raw.id) throw new Error('Mirakl return is missing its required id')
  if (!raw.order_id) {
    throw new Error(`Mirakl return '${raw.id}' is missing its required order_id`)
  }

  return {
    id: raw.id,
    orderId: raw.order_id,
    reason: raw.reason_code ?? undefined,
    note: raw.description ?? undefined,
    refundLineItems: mapLines(raw.id, raw.return_lines),
    createdAt: toIsoDatetime(raw.date_created),
    metadata: raw as Record<string, unknown>,
  }
}
