import type { Deal } from '../../../schema/deal'

export interface RawCloseOpportunity {
  id: string
  note?: string
  status?: string
  value?: number
  value_currency?: string
  value_period?: string
  pipeline_id?: string
  pipeline_stage_id?: string
  lead_id?: string
  user_id?: string
  contact_id?: string
  expected_date?: string
  date_created?: string
  date_updated?: string
  [key: string]: unknown
}

/**
 * Close stores deal value in cents (integer). Convert to major currency units.
 */
function centsToAmount(cents?: number): number | undefined {
  if (cents == null) return undefined
  return cents / 100
}

function amountToCents(amount?: number): number | undefined {
  if (amount == null) return undefined
  return Math.round(amount * 100)
}

function mapStatus(status?: string): string | undefined {
  if (!status) return undefined
  // Close: active / won / lost → canonical: open / won / lost
  if (status === 'active') return 'open'
  return status
}

function unmapStatus(status?: string): string | undefined {
  if (!status) return undefined
  if (status === 'open') return 'active'
  return status
}

export function transformDeal(raw: RawCloseOpportunity): Deal {
  return {
    id: raw.id,
    title: raw.note ?? '',
    status: mapStatus(raw.status),
    value: raw.value != null
      ? { amount: centsToAmount(raw.value) ?? 0, currency: raw.value_currency ?? 'USD' }
      : undefined,
    pipeline_id: raw.pipeline_id,
    stage_id: raw.pipeline_stage_id,
    company_id: raw.lead_id,
    owner_id: raw.user_id,
    contact_ids: raw.contact_id ? [raw.contact_id] : undefined,
    close_date: raw.expected_date,
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.note = data.title
  if (data.status !== undefined) out.status = unmapStatus(data.status)
  if (data.value?.amount !== undefined) out.value = amountToCents(data.value.amount)
  if (data.value?.currency !== undefined) out.value_currency = data.value.currency
  if (data.pipeline_id !== undefined) out.pipeline_id = data.pipeline_id
  if (data.stage_id !== undefined) out.pipeline_stage_id = data.stage_id
  if (data.company_id !== undefined) out.lead_id = data.company_id
  if (data.owner_id !== undefined) out.user_id = data.owner_id
  if (data.contact_ids?.[0] !== undefined) out.contact_id = data.contact_ids[0]
  if (data.close_date !== undefined) out.expected_date = data.close_date
  return out
}
