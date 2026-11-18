import type { Deal } from '../../../schema/deal'

export interface RawPipelinerOpportunity {
  id: string
  name: string
  value?: number | null
  currency_id?: string | null
  account_id?: string | null
  primary_contact_id?: string | null
  pipeline_id?: string | null
  sales_status_id?: string | null
  owner_id?: string | null
  expected_close_date?: string | null
  quick_win_percentage?: number | null
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawPipelinerOpportunity): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.value != null
      ? { amount: raw.value, currency: raw.currency_id ?? 'USD' }
      : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    contact_ids: raw.primary_contact_id != null ? [String(raw.primary_contact_id)] : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    stage_id: raw.sales_status_id != null ? String(raw.sales_status_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.expected_close_date ?? undefined,
    probability: raw.quick_win_percentage ?? undefined,
    created_at: raw.created,
    updated_at: raw.modified,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency_id = data.value.currency
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.primary_contact_id = data.contact_ids[0]
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.stage_id !== undefined) out.sales_status_id = data.stage_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.close_date !== undefined) out.expected_close_date = data.close_date
  if (data.probability !== undefined) out.quick_win_percentage = data.probability
  return out
}
