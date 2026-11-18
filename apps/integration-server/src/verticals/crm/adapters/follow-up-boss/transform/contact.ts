/**
 * Follow Up Boss person ↔ canonical Contact transform.
 *
 * FUB people wire shape (GET /v1/people, GET /v1/people/:id):
 *   id            number  — unique person id
 *   firstName     string
 *   lastName      string
 *   name          string  — display name
 *   stage         string  — lifecycle stage
 *   source        string
 *   emails        { value: string; type: string }[]
 *   phones        { value: string; type: string }[]
 *   tags          string[]
 *   assignedTo    string  — user email of the assigned agent
 *   assignedUserId number
 *   created       string  — ISO 8601
 *   updated       string  — ISO 8601
 */
import type { Contact } from '../../../schema/contact'

interface FubEmailPhone {
  value?: string
  type?: string
  [key: string]: unknown
}

export interface RawFollowUpBossPerson {
  id?: number | string
  firstName?: string
  lastName?: string
  name?: string
  stage?: string
  source?: string
  emails?: FubEmailPhone[]
  phones?: FubEmailPhone[]
  tags?: string[]
  assignedTo?: string
  assignedUserId?: number | string
  created?: string
  updated?: string
  [key: string]: unknown
}

function firstEmail(emails?: FubEmailPhone[]): string | undefined {
  if (!emails || emails.length === 0) return undefined
  const primary = emails.find((e) => e.type === 'work' || e.type === 'personal') ?? emails[0]
  return primary?.value ?? undefined
}

function firstPhone(phones?: FubEmailPhone[]): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const mobile = phones.find((p) => p.type === 'mobile') ?? phones[0]
  return mobile?.value ?? undefined
}

export function transformContact(raw: RawFollowUpBossPerson): Contact {
  const firstName = raw.firstName ?? undefined
  const lastName = raw.lastName ?? undefined
  const displayName =
    raw.name ??
    ([firstName, lastName].filter(Boolean).join(' ') || undefined)

  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: displayName,
    email: firstEmail(raw.emails),
    phone: firstPhone(raw.phones),
    stage: raw.stage ?? undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    owner_id: raw.assignedTo ?? (raw.assignedUserId != null ? String(raw.assignedUserId) : undefined),
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(
  data: Partial<Contact>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emails = [{ value: data.email, type: 'personal' }]
  if (data.phone !== undefined) out.phones = [{ value: data.phone, type: 'mobile' }]
  if (data.stage !== undefined) out.stage = data.stage
  if (data.tags !== undefined) out.tags = data.tags
  if (data.owner_id !== undefined) out.assignedTo = data.owner_id
  return out
}
