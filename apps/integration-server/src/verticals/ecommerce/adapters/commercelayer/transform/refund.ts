/**
 * Commerce Layer Return → canonical Refund.
 *
 * Commerce Layer Returns represent requests to return items from an order.
 * Returns trigger refunds. Status lifecycle:
 *   draft → requested → approved → shipped → received → cancelled / rejected
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCLReturn {
  id: string
  number?: string | number
  status?: string
  created_at?: string
  updated_at?: string
  approved_at?: string | null
  received_at?: string | null
  archived_at?: string | null
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

export function transformRefund(raw: RawCLReturn): Refund {
  const rels = raw._relationships as Record<string, { data?: { id: string } | null }> | undefined
  return {
    id: raw.id,
    orderId: rels?.['order']?.data?.id ?? '',
    reason: raw.status,
    processedAt: toIsoDatetime(raw.approved_at ?? raw.received_at),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformRefund(
  refund: Partial<Refund>,
): Record<string, unknown> {
  return {
    data: {
      type: 'returns',
      attributes: {},
      relationships: {
        order: {
          data: refund.orderId
            ? { type: 'orders', id: refund.orderId }
            : undefined,
        },
      },
    },
  }
}
