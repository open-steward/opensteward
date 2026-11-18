import type { Deal } from '../../../schema/deal'

export interface RawApolloOpportunity {
  id: string
  name: string
  amount?: number | null
  account_id?: string | null
  contact_id?: string | null
  stage_id?: string | null
  owner_id?: string | null
  close_date?: string | null
  status?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawApolloOpportunity): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.amount != null ? { amount: raw.amount, currency: 'USD' } : undefined,
    company_id: raw.account_id ?? undefined,
    contact_ids: raw.contact_id != null ? [String(raw.contact_id)] : undefined,
    stage_id: raw.stage_id ?? undefined,
    owner_id: raw.owner_id ?? undefined,
    close_date: raw.close_date ?? undefined,
    status: raw.status,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  if (data.status !== undefined) out.status = data.status
  return out
}
