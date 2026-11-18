import type { Deal } from '../../../schema/deal'

// CorporateStack deal entity
// TODO: verify exact field names from API response
export interface RawCorporateStackDeal {
  id: string | number
  title?: string
  name?: string
  amount?: number
  currency?: string
  status?: string
  stage_id?: string | number
  pipeline_id?: string | number
  company_id?: string | number
  owner_id?: string | number
  close_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawCorporateStackDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? raw.name ?? '',
    value: raw.amount != null ? { amount: raw.amount, currency: raw.currency ?? 'USD' } : undefined,
    status: raw.status,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.close_date,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
