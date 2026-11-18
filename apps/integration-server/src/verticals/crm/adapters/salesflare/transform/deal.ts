import type { Deal } from '../../../schema/deal'

export interface RawSalesflareDeal {
  id: number
  name?: string
  value?: number
  currency?: string
  stage?: string
  pipeline?: { id: number; name?: string } | null
  account?: { id: number; name?: string } | null
  contacts?: Array<{ id: number }>
  assigned_to?: { id: number; name?: string } | null
  expected_close_date?: string
  probability?: number
  status?: string
  creation_time?: string
  modification_time?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSalesflareDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.value != null
      ? { amount: raw.value, currency: raw.currency ?? 'USD' }
      : undefined,
    status: raw.status,
    stage: raw.stage,
    pipeline_id: raw.pipeline?.id != null ? String(raw.pipeline.id) : undefined,
    company_id: raw.account?.id != null ? String(raw.account.id) : undefined,
    contact_ids: raw.contacts?.map((c) => String(c.id)),
    owner_id: raw.assigned_to?.id != null ? String(raw.assigned_to.id) : undefined,
    close_date: raw.expected_close_date,
    probability: raw.probability,
    created_at: raw.creation_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.status !== undefined) out.status = data.status
  if (data.stage !== undefined) out.stage = data.stage
  if (data.pipeline_id !== undefined) out.pipeline = { id: Number(data.pipeline_id) }
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.contact_ids !== undefined) out.contacts = data.contact_ids.map((id) => ({ id: Number(id) }))
  if (data.owner_id !== undefined) out.assigned_to = { id: Number(data.owner_id) }
  if (data.close_date !== undefined) out.expected_close_date = data.close_date
  if (data.probability !== undefined) out.probability = data.probability
  return out
}
