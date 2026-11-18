import type { Deal } from '../../../schema/deal'

/**
 * `RestV2Opportunity` in the Keap REST v2 OpenAPI spec
 * (https://crm.infusionsoft.com/app/v3/api-docs/V2): `id`,
 * `opportunity_title`, `stage` (`OpportunityStage`: `id`, `name`),
 * `contact` (`OpportunityContact`: `id`), `user` (`RestV2User`: `id`),
 * `estimated_close_time`, `created_time`, `last_updated_time`.
 *
 * The revenue fields (`projected_revenue_low`, `projected_revenue_high`,
 * `monthly_revenue`, `order_revenue`) carry no documented currency, so no
 * canonical `value` is emitted; they stay in `metadata`.
 */
export interface RawKeapOpportunity {
  id: string
  opportunity_title: string
  stage?: { id?: string; name?: string } | null
  contact?: { id?: string } | null
  user?: { id?: string } | null
  estimated_close_time?: string
  created_time?: string
  last_updated_time?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawKeapOpportunity): Deal {
  return {
    id: String(raw.id),
    title: raw.opportunity_title,
    stage_id: raw.stage?.id != null ? String(raw.stage.id) : undefined,
    stage: raw.stage?.name,
    contact_ids: raw.contact?.id != null ? [String(raw.contact.id)] : undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    close_date: raw.estimated_close_time,
    created_at: raw.created_time,
    updated_at: raw.last_updated_time,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.opportunity_title = data.title
  if (data.value?.amount !== undefined) {
    out.opportunity_value = {
      total: data.value.amount,
      currency: data.value.currency ?? 'USD',
    }
  }
  if (data.stage_id !== undefined) out.stage = { id: Number(data.stage_id) }
  if (data.contact_ids?.[0] !== undefined) out.contact = { id: Number(data.contact_ids[0]) }
  if (data.owner_id !== undefined) out.user = { id: Number(data.owner_id) }
  if (data.close_date !== undefined) out.close_date = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}
