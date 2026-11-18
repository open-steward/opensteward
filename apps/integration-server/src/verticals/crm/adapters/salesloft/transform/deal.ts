import type { Deal } from '../../../schema/deal'

export interface RawSalesloftDeal {
  id: number
  name?: string
  amount?: number
  account_id?: number | null
  stage_name?: string
  owner_id?: number | null
  close_date?: string
  probability?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSalesloftDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.amount != null
      ? { amount: raw.amount, currency: 'USD' }
      : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    stage_id: raw.stage_name,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.close_date,
    probability: raw.probability,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.value?.amount !== undefined) out['amount'] = data.value.amount
  if (data.company_id !== undefined) out['account_id'] = Number(data.company_id)
  if (data.stage_id !== undefined) out['stage_name'] = data.stage_id
  if (data.owner_id !== undefined) out['owner_id'] = Number(data.owner_id)
  if (data.close_date !== undefined) out['close_date'] = data.close_date
  if (data.probability !== undefined) out['probability'] = data.probability
  return out
}
