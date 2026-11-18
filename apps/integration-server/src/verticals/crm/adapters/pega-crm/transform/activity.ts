/**
 * Transform Pega CRM task/activity records to canonical Activity.
 *
 * In Pega Sales Automation, Activities (tasks) are work cases of type
 * PegaCRM-Work-Task. They are accessible via:
 *   - GET /prweb/api/v1/cases?caseTypeID=PegaCRM-Work-Task (list)
 *   - GET /prweb/api/v1/cases/{ID}                         (detail)
 *   - POST /prweb/api/v1/cases                             (create)
 *   - PUT  /prweb/api/v1/cases/{ID}                        (update)
 *
 * Key fields:
 *   pzInsKey         — case system key (primary identifier)
 *   pyID             — business key / task number
 *   pyLabel          — task subject/title
 *   TaskType         — activity type (e.g. Call, Email, Meeting, Task)
 *   pyNote           — task notes / description
 *   pyDueDate        — due date/time
 *   pyStatusWork     — status (Open-New, Resolved-Completed, etc.)
 *   pyOwner          — owning operator ID
 *   ContactID        — linked contact identifier
 *   AccountID        — linked account identifier
 *   OpportunityID    — linked opportunity (deal) identifier
 *   pxCreateDateTime — ISO 8601 creation timestamp
 *   pxUpdateDateTime — ISO 8601 last-updated timestamp
 */

import type { Activity } from '../../../schema/activity'
import { parsePegaDatetime } from '../utils'

export interface RawPegaTask {
  pzInsKey?: string
  pyID?: string
  pyLabel?: string
  TaskType?: string
  pyNote?: string
  pyDueDate?: string
  pyStatusWork?: string
  pyOwner?: string
  ContactID?: string
  AccountID?: string
  OpportunityID?: string
  pxCreateDateTime?: string
  pxUpdateDateTime?: string
  pxObjClass?: string
  [key: string]: unknown
}

/** Map Pega task types to canonical activity type strings. */
function mapActivityType(pegaType?: string): string | undefined {
  if (!pegaType) return 'task'
  const t = pegaType.toLowerCase()
  if (t === 'call') return 'call'
  if (t === 'email') return 'email'
  if (t === 'meeting') return 'meeting'
  return 'task'
}

/** A task is done when its status starts with "Resolved-". */
function isDone(status?: string): boolean {
  return (status ?? '').toLowerCase().startsWith('resolved')
}

export function transformActivity(raw: RawPegaTask): Activity {
  return {
    id: String(raw.pzInsKey ?? raw.pyID ?? ''),
    type: mapActivityType(raw.TaskType),
    subject: raw.pyLabel ?? undefined,
    note: raw.pyNote ?? undefined,
    contact_id: raw.ContactID ? String(raw.ContactID) : undefined,
    company_id: raw.AccountID ? String(raw.AccountID) : undefined,
    deal_id: raw.OpportunityID ? String(raw.OpportunityID) : undefined,
    owner_id: raw.pyOwner ?? undefined,
    due_date: parsePegaDatetime(raw.pyDueDate),
    done: isDone(raw.pyStatusWork),
    created_at: parsePegaDatetime(raw.pxCreateDateTime),
    updated_at: parsePegaDatetime(raw.pxUpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  if (data.subject !== undefined) content.pyLabel = data.subject
  if (data.note !== undefined) content.pyNote = data.note
  if (data.due_date !== undefined) content.pyDueDate = data.due_date
  if (data.owner_id !== undefined) content.pyOwner = data.owner_id
  if (data.contact_id !== undefined) content.ContactID = data.contact_id
  if (data.company_id !== undefined) content.AccountID = data.company_id
  if (data.deal_id !== undefined) content.OpportunityID = data.deal_id
  if (data.type !== undefined) content.TaskType = data.type
  if (data.done !== undefined) {
    content.pyStatusWork = data.done ? 'Resolved-Completed' : 'Open-New'
  }
  return { content }
}
