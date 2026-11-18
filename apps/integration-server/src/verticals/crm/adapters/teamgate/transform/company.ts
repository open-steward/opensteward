import type { Company } from '../../../schema/company'

/**
 * Teamgate company fields from GET /v4/companies:
 *   id, name, phones (array), emails (array), urls (array),
 *   industryName, ownerId, createdTime, updatedTime, tags (array)
 */
export interface RawTeamgateCompany {
  id: number | string
  name?: string
  phones?: Array<{ type?: string; value?: string }> | string
  emails?: Array<{ type?: string; value?: string }> | string
  urls?: Array<{ type?: string; value?: string }> | string
  industryName?: string
  industryId?: number | string
  ownerId?: number | string
  createdTime?: string
  updatedTime?: string
  tags?: string[] | string
  [key: string]: unknown
}

function pickFirstValue(
  arr: Array<{ type?: string; value?: string }> | string | undefined,
): string | undefined {
  if (!arr) return undefined
  if (typeof arr === 'string') return arr || undefined
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  const v = arr[0]?.value
  return typeof v === 'string' && v ? v : undefined
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '') || undefined
  } catch {
    return undefined
  }
}

function toIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawTeamgateCompany): Company {
  const rawUrl = pickFirstValue(raw.urls)
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : String(raw.id),
    phone: pickFirstValue(raw.phones),
    domain: domainFromUrl(rawUrl),
    industry: typeof raw.industryName === 'string' && raw.industryName
      ? raw.industryName
      : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIso(raw.createdTime),
    updated_at: toIso(raw.updatedTime),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phones = [{ type: 'work', value: data.phone }]
  if (data.domain !== undefined) out.urls = [{ type: 'website', value: `https://${data.domain}` }]
  return out
}
