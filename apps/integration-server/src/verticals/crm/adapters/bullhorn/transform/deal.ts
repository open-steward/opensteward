import type { Deal } from '../../../schema/deal'

// Bullhorn "JobOrder" entity — job orders mapped as deals
export interface RawBullhornDeal {
  id: number
  title?: string
  salary?: number
  status?: string
  clientCorporation?: { id?: number }
  clientContact?: { id?: number }
  owner?: { id?: number }
  dateEnd?: number | null
  dateAdded?: number
  dateLastModified?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawBullhornDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    value: raw.salary != null ? { amount: raw.salary, currency: 'AUD' } : undefined,
    status: raw.status,
    company_id: raw.clientCorporation?.id != null ? String(raw.clientCorporation.id) : undefined,
    contact_ids: raw.clientContact?.id != null ? [String(raw.clientContact.id)] : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    close_date: raw.dateEnd != null ? new Date(raw.dateEnd).toISOString() : undefined,
    created_at: raw.dateAdded != null ? new Date(raw.dateAdded).toISOString() : undefined,
    updated_at: raw.dateLastModified != null ? new Date(raw.dateLastModified).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) out.salary = data.value.amount
  if (data.status !== undefined) out.status = data.status
  if (data.company_id !== undefined) out.clientCorporation = { id: Number(data.company_id) }
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  if (data.close_date !== undefined) out.dateEnd = data.close_date
  return out
}
