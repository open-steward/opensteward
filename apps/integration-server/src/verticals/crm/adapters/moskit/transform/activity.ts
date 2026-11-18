import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'
import { refId, soleRefId, type MoskitEntityId } from '../entity'

/**
 * Activity.v2.yaml ("Atividade"), the fields read here.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Activity.v2.yaml
 *
 * `type` is an EntityId into /activityTypes, not a kind name, so the canonical
 * `type` is omitted; the reference stays in `metadata`.
 */
export interface RawMoskitActivity {
  id: number
  /** "Titulo da atividade" */
  title?: string
  createdBy?: MoskitEntityId | null
  responsible?: MoskitEntityId | null
  dateCreated?: string
  /** "data da atividade" */
  dueDate?: string
  /** "data em que a atividade foi concluída" */
  doneDate?: string | null
  type?: MoskitEntityId | null
  /** "duração da atividade (em minutos)" */
  duration?: number
  /** "Notas da atividade" */
  notes?: string
  contacts?: MoskitEntityId[] | null
  deals?: MoskitEntityId[] | null
  companies?: MoskitEntityId[] | null
  [key: string]: unknown
}

export function transformActivity(raw: RawMoskitActivity): Activity {
  return {
    id: String(raw.id),
    subject: raw.title || undefined,
    note: raw.notes || undefined,
    // Related records are arrays; only an unambiguous single one is mapped.
    contact_id: soleRefId(raw.contacts),
    company_id: soleRefId(raw.companies),
    deal_id: soleRefId(raw.deals),
    owner_id: refId(raw.responsible),
    due_date: toIsoDatetime(raw.dueDate),
    done: Boolean(raw.doneDate),
    duration_minutes:
      typeof raw.duration === 'number' && Number.isInteger(raw.duration) && raw.duration >= 0
        ? raw.duration
        : undefined,
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contact = { id: data.contact_id }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.deal_id !== undefined) out.deal = { id: data.deal_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
