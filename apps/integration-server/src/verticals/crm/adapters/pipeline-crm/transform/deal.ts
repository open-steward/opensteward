import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawPipelineCrmDeal {
  id: string | number
  name?: string
  value?: number | string
  currency?: string
  status?: string
  stage_id?: string | number
  pipeline_id?: string | number
  contact_id?: string | number
  company_id?: string | number
  owner_id?: string | number
  close_date?: string
  probability?: number | string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawPipelineCrmDeal): Deal {
  // Pipeline CRM stores deal value as major units (e.g. USD dollars).
  // Canonical amount is integer minor units (cents).
  let value: Deal['value']
  if (raw.value != null && raw.currency != null) {
    const major = typeof raw.value === 'string' ? parseFloat(raw.value) : raw.value
    value = {
      amount: Math.round(major * 100),
      currency: String(raw.currency),
    }
  } else if (raw.value != null) {
    const major = typeof raw.value === 'string' ? parseFloat(raw.value) : raw.value
    value = {
      amount: Math.round(major * 100),
      currency: 'USD',
    }
  }

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value,
    status: raw.status,
    stage_id: raw.stage_id != null ? String(raw.stage_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    contact_ids: raw.contact_id != null ? [String(raw.contact_id)] : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    close_date: toIsoDatetime(raw.close_date),
    probability: raw.probability != null ? Number(raw.probability) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) {
    // Convert minor units back to major units for the API.
    out.value = data.value.amount / 100
    out.currency = data.value.currency
  }
  if (data.stage_id !== undefined) out.stage_id = data.stage_id
  if (data.close_date !== undefined) out.close_date = data.close_date
  return out
}
