import type { Deal } from '../../../schema/deal'

export interface RawSalesforceOpportunity {
  Id: string
  Name: string
  Amount?: number | null
  StageName?: string | null
  CloseDate?: string | null
  AccountId?: string | null
  OwnerId?: string | null
  Probability?: number | null
  CreatedDate?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSalesforceOpportunity): Deal {
  return {
    id: String(raw.Id),
    title: raw.Name,
    value: raw.Amount != null ? { amount: raw.Amount, currency: 'USD' } : undefined,
    stage_id: raw.StageName ?? undefined,
    close_date: raw.CloseDate ?? undefined,
    company_id: raw.AccountId ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    probability: raw.Probability ?? undefined,
    created_at: raw.CreatedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Name = data.title
  if (data.value?.amount !== undefined) out.Amount = data.value.amount
  if (data.stage_id !== undefined) out.StageName = data.stage_id
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  if (data.company_id !== undefined) out.AccountId = data.company_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  if (data.probability !== undefined) out.Probability = data.probability
  return out
}
