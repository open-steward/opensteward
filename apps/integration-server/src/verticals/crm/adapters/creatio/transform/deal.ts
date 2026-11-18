import type { Deal } from '../../../schema/deal'

export interface RawCreatioOpportunity {
  Id: string
  Title: string
  Amount?: number
  CloseDate?: string
  StageId?: string | null
  AccountId?: string | null
  OwnerId?: string | null
  Probability?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawCreatioOpportunity): Deal {
  return {
    id: String(raw.Id),
    title: raw.Title,
    value: raw.Amount != null ? { amount: raw.Amount, currency: 'USD' } : undefined,
    close_date: raw.CloseDate,
    stage_id: raw.StageId ?? undefined,
    company_id: raw.AccountId ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    probability: raw.Probability,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Title = data.title
  if (data.value?.amount !== undefined) out.Amount = data.value.amount
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  if (data.stage_id !== undefined) out.StageId = data.stage_id
  if (data.company_id !== undefined) out.AccountId = data.company_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.probability !== undefined) out.Probability = data.probability
  return out
}
