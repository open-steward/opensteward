import type { Deal } from '../../../schema/deal'

export interface RawZendeskSellDeal {
  id: number
  name: string
  value?: number
  currency?: string
  organization_id?: number | null
  contact_id?: number | null
  stage_id?: number | null
  pipeline_id?: number | null
  owner_id?: number | null
  estimated_close_date?: string | null
  confidence?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawZendeskSellDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.value != null
      ? { amount: raw.value, currency: raw.currency ?? 'USD' }
      : undefined,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
    contact_ids: raw.contact_id != null ? [String(raw.contact_id)] : undefined,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.estimated_close_date ?? undefined,
    probability: raw.confidence ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.contact_id = Number(data.contact_ids[0])
  if (data.stage_id !== undefined) out.stage_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.close_date !== undefined) out.estimated_close_date = data.close_date
  if (data.probability !== undefined) out.confidence = data.probability
  return out
}
