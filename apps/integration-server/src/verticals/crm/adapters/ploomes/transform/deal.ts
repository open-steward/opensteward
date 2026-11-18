import type { Deal } from '../../../schema/deal'

export interface RawPloomesDeal {
  Id: number | string
  Title?: string
  Price?: number | null
  Status?: number | null
  StatusText?: string | null
  StepId?: number | string | null
  FunnelId?: number | string | null
  ContactId?: number | string | null
  AccountId?: number | string | null
  OwnerId?: number | string | null
  CloseDate?: string | null
  CreateDate?: string
  LastUpdateDate?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawPloomesDeal): Deal {
  return {
    id: String(raw.Id),
    title: raw.Title ?? '',
    value: raw.Price != null ? { amount: raw.Price, currency: 'BRL' } : undefined,
    status: raw.StatusText ?? undefined,
    stage_id: raw.StepId != null ? String(raw.StepId) : undefined,
    pipeline_id: raw.FunnelId != null ? String(raw.FunnelId) : undefined,
    contact_ids: raw.ContactId != null ? [String(raw.ContactId)] : undefined,
    company_id: raw.AccountId != null ? String(raw.AccountId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    close_date: raw.CloseDate ?? undefined,
    created_at: raw.CreateDate ?? undefined,
    updated_at: raw.LastUpdateDate ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Title = data.title
  if (data.value?.amount !== undefined) out.Price = data.value.amount
  if (data.stage_id !== undefined) out.StepId = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.FunnelId = Number(data.pipeline_id)
  if (data.contact_ids?.[0] !== undefined) out.ContactId = Number(data.contact_ids[0])
  if (data.company_id !== undefined) out.AccountId = Number(data.company_id)
  if (data.owner_id !== undefined) out.OwnerId = Number(data.owner_id)
  if (data.close_date !== undefined) out.CloseDate = data.close_date
  return out
}
