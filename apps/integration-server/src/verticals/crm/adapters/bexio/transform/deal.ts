import type { Deal } from '../../../schema/deal'

// Bexio doesn't have a native deal/opportunity entity; we use quotes (kb_offer) as proxy
// or just return empty if the customer uses projects instead
export interface RawBexioQuote {
  id?: number
  title?: string
  total_gross?: number
  currency_id?: number
  kb_item_status_id?: number
  contact_id?: number
  contact_sub_id?: number
  user_id?: number
  is_valid_from?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawBexioQuote): Deal {
  return {
    id: String(raw.id ?? ''),
    title: raw.title ?? '',
    value: raw.total_gross != null
      ? { amount: raw.total_gross, currency: 'CHF' }
      : undefined,
    status: raw.kb_item_status_id != null ? String(raw.kb_item_status_id) : undefined,
    company_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    contact_ids: raw.contact_sub_id != null ? [String(raw.contact_sub_id)] : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    close_date: raw.is_valid_from,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.total_gross = data.value.amount
  if (data.company_id !== undefined) out.contact_id = Number(data.company_id)
  if (data.contact_ids?.[0] !== undefined) out.contact_sub_id = Number(data.contact_ids[0])
  if (data.close_date !== undefined) out.is_valid_from = data.close_date
  return out
}
