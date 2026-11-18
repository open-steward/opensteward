import type { Company } from '../../../schema/company'

export interface RawCopperCompany {
  id: number
  name: string
  websites?: Array<{ url: string; category?: string }>
  phone_numbers?: Array<{ number: string; category?: string }>
  details?: string
  assignee_id?: number | null
  date_created?: number
  date_modified?: number
  [key: string]: unknown
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformCompany(raw: RawCopperCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.websites?.[0]?.url,
    phone: raw.phone_numbers?.[0]?.number,
    owner_id: raw.assignee_id != null ? String(raw.assignee_id) : undefined,
    created_at: unixToIso(raw.date_created),
    updated_at: unixToIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.websites = [{ url: data.domain, category: 'work' }]
  if (data.phone !== undefined) out.phone_numbers = [{ number: data.phone, category: 'work' }]
  if (data.owner_id !== undefined) out.assignee_id = Number(data.owner_id)
  return out
}
