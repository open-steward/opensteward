/**
 * SAP Sales Cloud V2 — Task (Activity) transform.
 *
 * SAP Sales Cloud V2 does NOT expose a generic "activity-service/activities"
 * endpoint.  Activities are split into two separate services published on the
 * SAP Business Accelerator Hub (SAPSalesServiceCloudV2):
 *
 *   SalesSvcCloudV2_taskService    → task-service/tasks
 *   SalesSvcCloudV2_appointment    → appointment-service/appointments
 *
 * This adapter maps the canonical Activity resource to Tasks, which are the
 * most broadly applicable activity type.  The canonical `type` field is set
 * to "task" by default; callers may override this or extend to appointments.
 *
 * Endpoint: GET /sap/c4c/api/v1/task-service/tasks
 *
 * Key fields (SAP task):
 *   id               — system UUID
 *   subject          — short task title
 *   categoryCode     — type indicator (maps to canonical type)
 *   note             — free-form body / description text
 *   dueDate          — scheduled or due date (ISO-8601)
 *   statusCode       — completion status ("1"=open, "2"=in_progress, "3"=completed)
 *   accountId        — linked account UUID
 *   contactId        — linked individual UUID
 *   opportunityId    — linked opportunity UUID
 *   ownerId          — assigned owner UUID
 *   durationMinutes  — planned duration (optional; may not be present on tasks)
 *   createdAt        — ISO-8601 creation timestamp (may lack timezone offset)
 *   lastModifiedAt   — ISO-8601 last-modified timestamp (may lack timezone offset)
 */
import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapActivity {
  id: string
  subject?: string
  /** SAP task category code (not a generic "activityTypeCode"). */
  categoryCode?: string
  note?: string
  dueDate?: string
  statusCode?: string
  accountId?: string
  contactId?: string
  opportunityId?: string
  ownerId?: string
  durationMinutes?: number | string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

/** Map SAP category code to a canonical activity type string. */
function mapType(code: string | undefined): string {
  if (!code) return 'task'
  const c = typeof code === 'string' ? code.toUpperCase() : ''
  if (c === 'PHONE_CALL' || c === 'PHONECALL') return 'call'
  if (c === 'EMAIL') return 'email'
  if (c === 'APPOINTMENT' || c === 'MEETING') return 'meeting'
  if (c === 'TASK') return 'task'
  return code.toLowerCase()
}

/** SAP statusCode "3" = completed; others are open. */
function isDone(code: string | undefined): boolean {
  if (typeof code !== 'string') return false
  return code === '3' || code.toUpperCase() === 'COMPLETED'
}

export function transformActivity(raw: RawSapActivity): Activity {
  const durationRaw = raw.durationMinutes
  let durationMinutes: number | undefined
  if (durationRaw != null) {
    const n = typeof durationRaw === 'number' ? durationRaw : parseInt(String(durationRaw), 10)
    durationMinutes = !isNaN(n) ? n : undefined
  }

  return {
    id: String(raw.id),
    type: mapType(raw.categoryCode),
    subject: raw.subject ?? undefined,
    note: raw.note ?? undefined,
    contact_id: raw.contactId ?? undefined,
    company_id: raw.accountId ?? undefined,
    deal_id: raw.opportunityId ?? undefined,
    owner_id: raw.ownerId ?? undefined,
    due_date: toIsoDatetime(raw.dueDate),
    done: isDone(raw.statusCode),
    duration_minutes: durationMinutes,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.duration_minutes !== undefined) out.durationMinutes = data.duration_minutes
  if (data.done !== undefined) {
    out.statusCode = data.done ? '3' : '1'
  }
  return out
}
