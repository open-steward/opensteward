import type { Deal } from '../../../schema/deal'

export interface RawWorkbooksOpportunity {
  id: string | number
  description?: string
  document_currency?: string
  document_value?: number | string
  probability?: number | string
  stage_name?: string
  close_date?: string
  document_date?: string
  assigned_to_id?: string | number
  opportunity_contact_ids?: (string | number)[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/**
 * Workbooks stores monetary amounts as major-unit floats (e.g. 1250.00 GBP).
 * Canonical Deal.value.amount is INTEGER minor units (cents/pence).
 */
function toMinorUnits(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!isFinite(n)) return undefined
  return Math.round(n * 100)
}

export function transformDeal(raw: RawWorkbooksOpportunity): Deal {
  const amountMinor = toMinorUnits(raw.document_value)
  const currency = typeof raw.document_currency === 'string' ? raw.document_currency.toUpperCase() : undefined

  return {
    id: String(raw.id),
    title: raw.description ?? '',
    value: amountMinor !== undefined && currency
      ? { amount: amountMinor, currency }
      : undefined,
    stage: raw.stage_name,
    probability: raw.probability !== undefined ? Number(raw.probability) : undefined,
    close_date: raw.close_date ?? raw.document_date,
    contact_ids: Array.isArray(raw.opportunity_contact_ids)
      ? raw.opportunity_contact_ids.map(String)
      : undefined,
    owner_id: raw.assigned_to_id !== undefined ? String(raw.assigned_to_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['description'] = data.title
  if (data.value !== undefined) {
    // Convert minor units back to major units for the API
    out['document_value'] = data.value.amount / 100
    out['document_currency'] = data.value.currency
  }
  if (data.stage !== undefined) out['stage_name'] = data.stage
  if (data.probability !== undefined) out['probability'] = data.probability
  if (data.close_date !== undefined) out['close_date'] = data.close_date
  return out
}
