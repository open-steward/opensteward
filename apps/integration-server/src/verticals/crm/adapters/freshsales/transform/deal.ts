import type { Deal } from '../../../schema/deal'

export interface RawFreshsalesDeal {
  id: number
  name: string
  amount?: number
  currency_symbol?: string
  sales_account_id?: number | null
  contact_ids?: number[]
  deal_stage_id?: number | null
  deal_pipeline_id?: number | null
  owner_id?: number | null
  expected_close?: string | null
  probability?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawFreshsalesDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.amount != null
      ? { amount: raw.amount, currency: raw.currency_symbol ?? 'USD' }
      : undefined,
    company_id: raw.sales_account_id != null ? String(raw.sales_account_id) : undefined,
    contact_ids: raw.contact_ids && raw.contact_ids.length > 0
      ? raw.contact_ids.map((c) => String(c))
      : undefined,
    stage_id: raw.deal_stage_id != null ? String(raw.deal_stage_id) : undefined,
    pipeline_id: raw.deal_pipeline_id != null ? String(raw.deal_pipeline_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.expected_close ?? undefined,
    probability: raw.probability,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.company_id !== undefined) out.sales_account_id = Number(data.company_id)
  if (data.contact_ids !== undefined) out.contact_ids = data.contact_ids.map(Number)
  if (data.stage_id !== undefined) out.deal_stage_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.deal_pipeline_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.close_date !== undefined) out.expected_close = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}
