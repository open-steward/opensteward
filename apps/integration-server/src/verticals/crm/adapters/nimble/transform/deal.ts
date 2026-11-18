import type { Deal } from '../../../schema/deal'

export interface RawNimbleDeal {
  id: string | number
  name?: string
  value?: {
    amount?: number | string
    currency?: string
  } | null
  pipeline_id?: string | number | null
  stage_id?: string | number | null
  contact_ids?: Array<string | number>
  owner_id?: string | number | null
  expected_closing_date?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawNimbleDeal): Deal {
  const amount = raw.value?.amount != null ? Number(raw.value.amount) : undefined
  return {
    id: String(raw.id),
    title: raw.name ?? String(raw.id),
    value: amount != null
      ? { amount, currency: raw.value?.currency ?? 'USD' }
      : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    contact_ids: raw.contact_ids && raw.contact_ids.length > 0
      ? [String(raw.contact_ids[0])]
      : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.expected_closing_date ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined || data.value?.currency !== undefined) {
    out.value = {
      amount: data.value?.amount,
      currency: data.value?.currency ?? 'USD',
    }
  }
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.contact_ids?.[0] !== undefined) out.contact_ids = [data.contact_ids[0]]
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.close_date !== undefined) out.expected_closing_date = data.close_date
  return out
}
