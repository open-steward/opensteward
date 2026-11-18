import type { Deal } from '../../../schema/deal'

// Rex Software uses "listings" for property/deal records
export interface RawRexListing {
  id?: number
  adr_street_name?: string
  adr_street_number?: string
  adr_suburb_or_town?: string
  search_price?: number | null
  contact_ids?: number[]
  account_id?: number | null
  user_id?: number | null
  listing_status?: string
  listing_category?: string
  listing_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function buildTitle(raw: RawRexListing): string {
  const parts = [raw.adr_street_number, raw.adr_street_name, raw.adr_suburb_or_town].filter(Boolean)
  return parts.join(' ') || `Listing ${raw.id ?? ''}`
}

export function transformDeal(raw: RawRexListing): Deal {
  return {
    id: String(raw.id ?? ''),
    title: buildTitle(raw),
    value: raw.search_price != null ? { amount: raw.search_price, currency: 'AUD' } : undefined,
    contact_ids: Array.isArray(raw.contact_ids) ? raw.contact_ids.map(String) : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    status: raw.listing_status,
    close_date: raw.listing_date,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.adr_street_name = data.title
  if (data.value?.amount !== undefined) out.search_price = data.value.amount
  if (data.contact_ids !== undefined) out.contact_ids = data.contact_ids.map(Number)
  if (data.company_id !== undefined) out.account_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.status !== undefined) out.listing_status = data.status
  return out
}
