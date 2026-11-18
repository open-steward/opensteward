import type { Deal } from '../../../schema/deal'

// SuiteCRM Opportunity (maps to Deal, JSON:API flattened)
export interface RawSuiteCrmOpportunity {
  id?: string
  name?: string
  amount?: number | string
  currency_id?: string
  currency_name?: string
  sales_stage?: string
  pipeline_id?: string
  account_id?: string
  assigned_user_id?: string
  close_date?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSuiteCrmOpportunity): Deal {
  const amount = raw.amount != null ? Number(raw.amount) : undefined
  return {
    id: String(raw.id ?? ''),
    title: raw.name ?? '',
    value: amount != null && !isNaN(amount)
      ? { amount, currency: raw.currency_name ?? 'USD' }
      : undefined,
    status: raw.sales_stage,
    stage_id: raw.sales_stage,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.assigned_user_id != null ? String(raw.assigned_user_id) : undefined,
    close_date: raw.close_date,
    created_at: raw.date_entered,
    updated_at: raw.date_modified,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.status !== undefined) out.sales_stage = data.status
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
