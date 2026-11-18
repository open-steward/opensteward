import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

/**
 * An opportunity as "Get Opportunity list" / "Get Opportunity" return it
 * (GET /api/v2/orders; "Opportunities and orders are the same entity, what
 * distinguishes them is their probability"). Documented properties read here:
 * `description`, `closeDate`, `user` ("User who did the order"), `client`,
 * `contact` ("Object Contact reference"), `regDate`, `stage`, `probability`
 * ("between 0-100"), `modDate`, `currency` ("Currency order is sold in") and
 * `value` ("Number, read-only Total order sum").
 */
export interface RawUpsalesDeal {
  id: number | string
  description?: string | null
  value?: number | null
  currency?: string | null
  probability?: number | null
  stage?: { id: number | string; name?: string } | null
  client?: { id: number | string } | null
  contact?: { id: number | string } | null
  user?: { id: number | string } | null
  closeDate?: string | null
  regDate?: string | null
  modDate?: string | null
  [key: string]: unknown
}

export function transformDeal(raw: RawUpsalesDeal): Deal {
  if (typeof raw.description !== 'string') {
    throw new Error(
      `Upsales order ${raw.id} has no description ("description String, mandatory Order description")`,
    )
  }
  return {
    id: String(raw.id),
    title: raw.description,
    // `value` is a plain number beside its own `currency` (sample: 10000, "SEK").
    // Without either one there is no money to report.
    value:
      typeof raw.value === 'number' && typeof raw.currency === 'string' && raw.currency !== ''
        ? { amount: raw.value, currency: raw.currency }
        : undefined,
    stage_id: raw.stage?.id != null ? String(raw.stage.id) : undefined,
    stage: raw.stage?.name,
    probability: typeof raw.probability === 'number' ? raw.probability : undefined,
    company_id: raw.client?.id != null ? String(raw.client.id) : undefined,
    contact_ids: raw.contact?.id != null ? [String(raw.contact.id)] : undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    close_date: toIsoDatetime(raw.closeDate),
    created_at: toIsoDatetime(raw.regDate),
    updated_at: toIsoDatetime(raw.modDate),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.description = data.title
  if (data.value?.amount !== undefined) {
    out.value = { amount: data.value.amount, currency: data.value.currency ?? 'SEK' }
  }
  if (data.stage_id !== undefined) out.stage = { id: Number(data.stage_id) }
  if (data.company_id !== undefined) out.client = { id: Number(data.company_id) }
  if (data.contact_ids !== undefined) {
    out.contact = data.contact_ids.map((id) => ({ id: Number(id) }))
  }
  if (data.owner_id !== undefined) out.user = { id: Number(data.owner_id) }
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
