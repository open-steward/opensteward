import type { Deal } from '../../../schema/deal'

export interface RawRdStationDeal {
  _id: string
  name?: string
  amount_montly?: number | null
  win?: boolean
  deal_stage?: { _id: string } | null
  contact_id?: string | null
  organization_id?: string | null
  user?: { _id: string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawRdStationDeal): Deal {
  return {
    id: raw._id,
    title: raw.name ?? '',
    value: raw.amount_montly != null
      ? { amount: raw.amount_montly, currency: 'BRL' }
      : undefined,
    status: raw.win === true ? 'won' : raw.win === false ? 'lost' : undefined,
    stage_id: raw.deal_stage?._id ?? undefined,
    contact_ids: raw.contact_id ? [raw.contact_id] : undefined,
    company_id: raw.organization_id ?? undefined,
    owner_id: raw.user?._id ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount_montly = data.value.amount
  if (data.stage_id !== undefined) out.deal_stage = { _id: data.stage_id }
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.owner_id !== undefined) out.user = { _id: data.owner_id }
  return out
}
