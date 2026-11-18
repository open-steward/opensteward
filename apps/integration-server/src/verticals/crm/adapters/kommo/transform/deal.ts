import type { Deal } from '../../../schema/deal'

interface KommoEmbeddedContact {
  id: number
}

interface KommoEmbeddedCompany {
  id: number
}

export interface RawKommoDeal {
  id: number
  name?: string
  price?: number
  status_id?: number
  pipeline_id?: number
  responsible_user_id?: number
  closed_at?: number
  created_at?: number
  updated_at?: number
  _embedded?: {
    contacts?: KommoEmbeddedContact[]
    companies?: KommoEmbeddedCompany[]
  }
  [key: string]: unknown
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null || ts === 0) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformDeal(raw: RawKommoDeal): Deal {
  const contactId = raw._embedded?.contacts?.[0]?.id
  const companyId = raw._embedded?.companies?.[0]?.id

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.price != null ? { amount: raw.price, currency: 'USD' } : undefined,
    stage_id: raw.status_id != null ? String(raw.status_id) : undefined,
    pipeline_id: raw.pipeline_id != null ? String(raw.pipeline_id) : undefined,
    contact_ids: contactId != null ? [String(contactId)] : undefined,
    company_id: companyId != null ? String(companyId) : undefined,
    owner_id: raw.responsible_user_id != null ? String(raw.responsible_user_id) : undefined,
    close_date: unixToIso(raw.closed_at),
    created_at: unixToIso(raw.created_at),
    updated_at: unixToIso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.price = data.value.amount
  if (data.stage_id !== undefined) out.status_id = Number(data.stage_id)
  if (data.pipeline_id !== undefined) out.pipeline_id = Number(data.pipeline_id)
  if (data.owner_id !== undefined) out.responsible_user_id = Number(data.owner_id)
  return out
}
