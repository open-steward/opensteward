/**
 * Gold-Vision ↔ canonical Activity transforms.
 *
 * Gold-Vision surfaces activities under the `activities` entity.
 *
 * Wire field reference (from /api/cosmos/activities metadata):
 *   id              — unique record identifier
 *   summary         — activity subject / title
 *   type            — activity type label (lookup: call, email, meeting, task, etc.)
 *   notes           — free-form body / description
 *   accountId       — linked Account id
 *   contactId       — linked Contact id
 *   opportunityId   — linked Opportunity (Deal) id
 *   ownerId         — assigned user id
 *   dueDate         — scheduled / due datetime (ISO 8601)
 *   completed       — boolean completion flag
 *   durationMinutes — planned duration in minutes
 *   createdDate     — ISO 8601 creation timestamp
 *   modifiedDate    — ISO 8601 last-modified timestamp
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawGoldVisionActivity {
  id?: string | number
  summary?: string
  type?: string | { id?: string | number; summary?: string }
  notes?: string
  accountId?: string | number
  contactId?: string | number
  opportunityId?: string | number
  ownerId?: string | number
  dueDate?: string
  completed?: boolean
  durationMinutes?: string | number
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function resolveLabel(
  field: string | { id?: string | number; summary?: string } | undefined,
): string | undefined {
  if (!field) return undefined
  if (typeof field === 'string') return field || undefined
  return field.summary ?? undefined
}

export function transformActivity(raw: RawGoldVisionActivity): Activity {
  const durationRaw =
    typeof raw.durationMinutes === 'number'
      ? raw.durationMinutes
      : raw.durationMinutes != null
        ? parseInt(String(raw.durationMinutes), 10)
        : undefined
  const durationMinutes =
    durationRaw != null && !isNaN(durationRaw) ? durationRaw : undefined

  return {
    id: String(raw.id ?? ''),
    type: resolveLabel(raw.type) ?? 'task',
    subject: raw.summary ?? undefined,
    note: raw.notes ?? undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    due_date: toIsoDatetime(raw.dueDate),
    done: raw.completed ?? undefined,
    duration_minutes: durationMinutes,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(
  data: Partial<Activity>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.summary = data.subject
  if (data.type !== undefined) out.type = data.type
  if (data.note !== undefined) out.notes = data.note
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.duration_minutes !== undefined) out.durationMinutes = data.duration_minutes
  return out
}
