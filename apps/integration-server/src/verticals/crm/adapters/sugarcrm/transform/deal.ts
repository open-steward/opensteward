import type { Deal } from '../../../schema/deal'

export interface RawSugarOpportunity {
  id: string
  name: string
  amount?: number | string
  currency_id?: string
  account_id?: string
  sales_stage?: string
  probability?: number | string
  close_date?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return `${value}Z`
}

export function transformDeal(raw: RawSugarOpportunity): Deal {
  const amount = raw.amount != null ? Number(raw.amount) : undefined
  const probability = raw.probability != null ? Number(raw.probability) : undefined
  return {
    id: raw.id,
    title: raw.name,
    value: amount != null
      ? { amount, currency: raw.currency_id ?? 'USD' }
      : undefined,
    company_id: raw.account_id || undefined,
    stage_id: raw.sales_stage || undefined,
    probability: !Number.isNaN(probability) ? probability : undefined,
    close_date: raw.close_date || undefined,
    owner_id: raw.assigned_user_id || undefined,
    created_at: toIso(raw.date_entered),
    updated_at: toIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.value?.currency !== undefined) out.currency_id = data.value.currency
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.stage_id !== undefined) out.sales_stage = data.stage_id
  if (data.probability !== undefined) out.probability = data.probability
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
