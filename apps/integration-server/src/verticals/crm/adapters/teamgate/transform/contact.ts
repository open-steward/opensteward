import type { Contact } from '../../../schema/contact'

/**
 * Teamgate represents contacts as "people" in the API.
 *
 * Key fields from GET /v4/people:
 *   id, name, emails (array), phones (array), companyId, companyJobTitle,
 *   createdTime, updatedTime, ownerId
 *
 * The `name` field is a single full-name string; Teamgate does not expose
 * separate firstName / lastName in the v4 REST response, so we leave
 * first_name / last_name unset and populate `name` from the top-level field.
 */
export interface RawTeamgatePerson {
  id: number | string
  name?: string
  emails?: Array<{ type?: string; value?: string }> | string
  phones?: Array<{ type?: string; value?: string }> | string
  companyId?: number | string | null
  companyJobTitle?: string
  ownerId?: number | string
  createdTime?: string
  updatedTime?: string
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

export function transformContact(raw: RawTeamgatePerson): Contact {
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' && raw.name ? raw.name : undefined,
    email: pickFirstValue(raw.emails),
    phone: pickFirstValue(raw.phones),
    title: typeof raw.companyJobTitle === 'string' && raw.companyJobTitle
      ? raw.companyJobTitle
      : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIso(raw.createdTime),
    updated_at: toIso(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.emails = [{ type: 'work', value: data.email }]
  if (data.phone !== undefined) out.phones = [{ type: 'work', value: data.phone }]
  if (data.title !== undefined) out.companyJobTitle = data.title
  if (data.company_id !== undefined) out.companyId = data.company_id
  return out
}
