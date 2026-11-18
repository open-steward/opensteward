import type { Activity } from '../../../schema/activity'

/**
 * Raw Daylite task as returned by GET /v1/tasks and GET /v1/tasks/:id.
 *
 * Daylite tasks map to the canonical Activity resource.
 * The Daylite REST API uses snake_case field names.
 *
 * Valid status values: "open", "pending", "deferred", "in_progress", "done", "cancelled".
 * A task is considered done when status === "done".
 *
 * Docs: https://developer.daylite.app/reference/task.md
 */
export interface RawDayliteTask {
  /** Relative resource URL, e.g. "/v1/tasks/99" */
  self?: string
  /** Task title / subject */
  title?: string
  /** Free-form task details / description */
  details?: string
  /** Due date/time (ISO 8601) */
  due?: string
  /** "open" | "pending" | "deferred" | "in_progress" | "done" | "cancelled" */
  status?: string
  /** Owner user URL */
  owner?: string
  /** Contact URLs linked to this task */
  contacts?: string[]
  /** Company URLs linked to this task */
  companies?: string[]
  /** Opportunity URLs linked to this task */
  opportunities?: string[]
  /** ISO 8601 creation timestamp (read-only) */
  create_date?: string
  /** ISO 8601 last-modified timestamp (read-only) */
  modify_date?: string
  [key: string]: unknown
}

function extractId(url: string | undefined): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/(\d+)$/)
  return match ? match[1] : undefined
}

export function transformActivity(raw: RawDayliteTask): Activity {
  const selfId = extractId(raw.self)
  const ownerId = extractId(raw.owner)
  const contactId = extractId(raw.contacts?.[0])
  const companyId = extractId(raw.companies?.[0])
  const dealId = extractId(raw.opportunities?.[0])

  return {
    id: selfId ?? String(raw['id'] ?? ''),
    type: 'task',
    subject: raw.title ?? undefined,
    note: raw.details ?? undefined,
    owner_id: ownerId,
    contact_id: contactId,
    company_id: companyId,
    deal_id: dealId,
    due_date: raw.due ?? undefined,
    done: raw.status === 'done',
    created_at: raw.create_date ?? undefined,
    updated_at: raw.modify_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.details = data.note
  if (data.due_date !== undefined) out.due = data.due_date
  if (data.owner_id !== undefined) out.owner = `/v1/users/${data.owner_id}`
  if (data.done !== undefined) out.status = data.done ? 'done' : 'open'
  if (data.contact_id !== undefined) {
    out.contacts = [`/v1/contacts/${data.contact_id}`]
  }
  if (data.company_id !== undefined) {
    out.companies = [`/v1/companies/${data.company_id}`]
  }
  if (data.deal_id !== undefined) {
    out.opportunities = [`/v1/opportunities/${data.deal_id}`]
  }
  return out
}
