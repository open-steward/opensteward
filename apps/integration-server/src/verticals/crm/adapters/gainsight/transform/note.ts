/**
 * Transform Gainsight Timeline Activity <-> canonical Note.
 *
 * Gainsight Timeline activities are the closest analogue to free-form
 * CRM notes.  The query endpoint returns records from the
 * `activity_timeline` object; the write endpoint lives under
 * `/v1/ant/es/activity`.
 *
 * Key fields from the activity_timeline query response:
 *   Gsid, Subject, Notes, GsCompanyId, AuthorId, ExternalId,
 *   CreatedDate, ModifiedDate, contextname
 *
 * Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Timeline_API/Timeline_APIs
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawGainsightTimeline {
  /** Gainsight system ID */
  Gsid?: string
  /** Subject / title of the timeline activity */
  Subject?: string
  /** Note body / content */
  Notes?: string
  /** Company GSID this activity is attached to */
  GsCompanyId?: string
  /** Author / owner user GSID */
  AuthorId?: string
  /** Caller-supplied idempotency key */
  ExternalId?: string
  /** ISO date strings */
  CreatedDate?: string
  ModifiedDate?: string
  /** Context type: "Company", "Relationship", "CTA", etc. */
  contextname?: string
  [key: string]: unknown
}

export function transformNote(raw: RawGainsightTimeline): Note {
  return {
    id: String(raw.Gsid ?? raw.ExternalId ?? ''),
    content: raw.Notes ?? raw.Subject ?? '',
    company_id: raw.GsCompanyId ? String(raw.GsCompanyId) : undefined,
    owner_id: raw.AuthorId ? String(raw.AuthorId) : undefined,
    created_at: toIsoDatetime(raw.CreatedDate),
    updated_at: toIsoDatetime(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(
  data: Partial<Note>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Notes = data.content
  if (data.company_id !== undefined) out.companyName = data.company_id
  if (data.owner_id !== undefined) out.Author = data.owner_id
  return out
}
