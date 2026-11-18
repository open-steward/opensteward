/**
 * noCRM.io Lead → canonical Deal transform.
 *
 * In noCRM.io the primary sales object is a "lead" (not a separate deal
 * entity). Leads map naturally to canonical Deals.
 *
 * Wire fields (noCRM.io REST v2 GET /leads and GET /leads/{id}):
 *   id, title, amount, currency, status, probability,
 *   step_id, pipeline_id, description, estimated_closing_date,
 *   created_at, updated_at, user (assigned user object with id)
 *   contact_name, email, phone, tags (array of strings)
 */

import type { Deal } from '../../../schema/deal'

export interface RawNocrmLead {
  id: number | string
  title: string
  amount?: number | null
  currency?: string | null
  status?: string | null
  probability?: number | null
  step_id?: number | string | null
  pipeline_id?: number | string | null
  description?: string | null
  estimated_closing_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** Assigned user object */
  user?: { id?: number | string } | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  tags?: string[] | null
  [key: string]: unknown
}

export function transformLead(raw: RawNocrmLead): Deal {
  const amount = raw.amount != null ? Number(raw.amount) : undefined
  const probability = raw.probability != null ? Number(raw.probability) : undefined

  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value:
      amount != null && !isNaN(amount)
        ? { amount, currency: raw.currency ?? 'USD' }
        : undefined,
    status: raw.status ?? undefined,
    stage_id: raw.step_id != null ? String(raw.step_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    owner_id:
      raw.user?.id != null ? String(raw.user.id) : undefined,
    probability:
      probability != null && !isNaN(probability) ? probability : undefined,
    close_date: raw.estimated_closing_date ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformLead(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.step_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.probability !== undefined) out.probability = data.probability
  if (data.close_date !== undefined) out.estimated_closing_date = data.close_date
  return out
}
