import type { Deal } from '../../../schema/deal'

export interface RawVtigerDeal {
  id: string
  potentialname: string
  amount?: string | number
  closingdate?: string
  sales_stage?: string
  accountid?: string
  assigned_user_id?: string
  probability?: string | number
  currency_id?: string
  createdtime?: string
  modifiedtime?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawVtigerDeal): Deal {
  const amount = raw.amount != null ? Number(raw.amount) : undefined
  const probability = raw.probability != null ? Number(raw.probability) : undefined
  return {
    id: String(raw.id),
    title: raw.potentialname,
    value: amount != null && !isNaN(amount)
      ? { amount, currency: 'USD' }
      : undefined,
    stage_id: raw.sales_stage,
    company_id: raw.accountid ? String(raw.accountid) : undefined,
    owner_id: raw.assigned_user_id ? String(raw.assigned_user_id) : undefined,
    close_date: raw.closingdate,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    created_at: raw.createdtime,
    updated_at: raw.modifiedtime,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.potentialname = data.title
  if (data.value?.amount !== undefined) out.amount = String(data.value.amount)
  if (data.stage_id !== undefined) out.sales_stage = data.stage_id
  if (data.company_id !== undefined) out.accountid = data.company_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  if (data.close_date !== undefined) out.closingdate = data.close_date
  if (data.probability !== undefined) out.probability = String(data.probability)
  return out
}
