/**
 * Transform between EngageBay deal wire format and canonical Deal.
 *
 * EngageBay deal fields are top-level (not wrapped in a properties array).
 * Key fields: id, name, amount, currency_type, closed_date (epoch ms),
 * track_id (pipeline), milestoneLabelName (stage), owner_id, description.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawEngageBayDeal {
  id?: number | string
  name?: string
  description?: string
  amount?: number | string
  currency_type?: string
  closed_date?: number | string
  track_id?: number | string
  milestoneLabelName?: string
  owner_id?: number | string
  tags?: Array<{ tag: string }>
  cursor?: string
  created_time?: number | string
  updated_time?: number | string
  [key: string]: unknown
}

export function transformDeal(raw: RawEngageBayDeal): Deal {
  const amount = raw.amount != null ? Number(raw.amount) : undefined
  const currency = raw.currency_type ?? undefined

  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value:
      amount != null && currency
        ? { amount, currency }
        : undefined,
    stage: raw.milestoneLabelName ?? undefined,
    pipeline_id: raw.track_id != null ? String(raw.track_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: toIsoDatetime(raw.closed_date),
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) {
    out.amount = data.value.amount
    out.currency_type = data.value.currency
  }
  if (data.stage !== undefined) out.milestoneLabelName = data.stage
  if (data.pipeline_id !== undefined) out.track_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.close_date !== undefined) {
    const d = new Date(data.close_date)
    if (!Number.isNaN(d.getTime())) out.closed_date = d.getTime()
  }
  return out
}
