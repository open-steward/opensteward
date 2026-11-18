import type { Deal } from '../../../schema/deal'

export interface RawAgileCrmDeal {
  id: number
  name: string
  expected_value?: number
  pipeline_id?: number
  milestone?: string
  probability?: number
  owner_id?: number
  close_date?: number  // epoch milliseconds
  contact_ids?: number[]
  created_time?: number
  updated_time?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawAgileCrmDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.expected_value != null
      ? { amount: raw.expected_value, currency: 'USD' }
      : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    // AgileCRM uses milestone name as stage identifier
    stage_id: raw.milestone,
    stage: raw.milestone,
    probability: raw.probability,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: raw.close_date != null
      ? new Date(raw.close_date).toISOString().split('T')[0]
      : undefined,
    contact_ids: raw.contact_ids?.map(String),
    created_at: raw.created_time ? new Date(raw.created_time * 1000).toISOString() : undefined,
    updated_at: raw.updated_time ? new Date(raw.updated_time * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.expected_value = data.value.amount
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.stage_id !== undefined) out.milestone = data.stage_id
  if (data.probability !== undefined) out.probability = data.probability
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.close_date !== undefined) {
    // Convert ISO date string to epoch ms
    out.close_date = new Date(data.close_date).getTime()
  }
  if (data.contact_ids !== undefined) out.contact_ids = data.contact_ids.map(Number)
  return out
}
