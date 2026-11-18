/**
 * BoondManager action ↔ canonical Activity transform.
 *
 * In BoondManager "actions" (`/actions`) represent CRM activities such as
 * calls, emails, meetings, and notes.
 *
 * Key attributes:
 *   typeOf (action kind), subject, content, startDate, endDate
 * Relationships:
 *   contact (contact_id), company (company_id), mainManager (owner_id)
 */

import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'
import type { JsonApiItem } from '../client'

export interface RawBoondManagerAction extends JsonApiItem {
  attributes: {
    typeOf?: string
    subject?: string
    content?: string
    startDate?: string
    endDate?: string
    creationDate?: string
    updateDate?: string
    [key: string]: unknown
  }
  relationships?: {
    contact?: { data?: { id?: string; type?: string } | null }
    company?: { data?: { id?: string; type?: string } | null }
    mainManager?: { data?: { id?: string; type?: string } | null }
    [key: string]: unknown
  }
}

export function transformActivity(raw: RawBoondManagerAction): Activity {
  const a = raw.attributes ?? {}
  const rels = raw.relationships ?? {}

  const contactId =
    (rels.contact as { data?: { id?: string } | null } | undefined)?.data?.id
  const companyId =
    (rels.company as { data?: { id?: string } | null } | undefined)?.data?.id
  const ownerId =
    (rels.mainManager as { data?: { id?: string } | null } | undefined)?.data?.id

  return {
    id: String(raw.id),
    type: (a.typeOf as string | undefined) ?? undefined,
    subject: (a.subject as string | undefined) ?? undefined,
    note: (a.content as string | undefined) ?? undefined,
    contact_id: contactId ?? undefined,
    company_id: companyId ?? undefined,
    owner_id: ownerId ?? undefined,
    due_date: toIsoDatetime(a.endDate ?? a.startDate),
    created_at: toIsoDatetime(a.creationDate),
    updated_at: toIsoDatetime(a.updateDate),
    metadata: { id: raw.id, type: raw.type, ...a, relationships: rels },
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out['typeOf'] = data.type
  if (data.subject !== undefined) out['subject'] = data.subject
  if (data.note !== undefined) out['content'] = data.note
  if (data.due_date !== undefined) out['endDate'] = data.due_date
  return out
}
