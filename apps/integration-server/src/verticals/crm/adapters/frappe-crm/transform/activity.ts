/**
 * Transform Frappe CRM Task → canonical Activity.
 *
 * Frappe CRM stores tasks as "CRM Task" documents:
 *   name               — Frappe doc name
 *   title              — short task title
 *   description        — free-form body
 *   status             — Backlog | Todo | In Progress | Done | Canceled
 *   priority           — Low | Medium | High
 *   assigned_to        — linked User
 *   due_date           — datetime (ISO)
 *   start_date         — date
 *   reference_doctype  — "CRM Lead" | "CRM Deal" | …
 *   reference_docname  — the linked doc's name
 *   creation           — ISO datetime
 *   modified           — ISO datetime
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawFrappeTask {
  name: string
  title?: string
  description?: string
  status?: string
  priority?: string
  assigned_to?: string
  due_date?: string
  start_date?: string
  reference_doctype?: string
  reference_docname?: string
  creation?: string
  modified?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawFrappeTask): Activity {
  const refType = raw.reference_doctype ?? ''
  const refName = raw.reference_docname ? String(raw.reference_docname) : undefined

  return {
    id: String(raw.name),
    type: 'task',
    subject: raw.title ?? undefined,
    note: raw.description ?? undefined,
    owner_id: raw.assigned_to ?? undefined,
    contact_id: refType === 'CRM Lead' ? refName : undefined,
    deal_id: refType === 'CRM Deal' ? refName : undefined,
    due_date: toIsoDatetime(raw.due_date),
    done: raw.status === 'Done' || raw.status === 'Canceled',
    created_at: toIsoDatetime(raw.creation),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.owner_id !== undefined) out.assigned_to = data.owner_id
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.status = data.done ? 'Done' : 'Todo'
  if (data.contact_id !== undefined) {
    out.reference_doctype = 'CRM Lead'
    out.reference_docname = data.contact_id
  } else if (data.deal_id !== undefined) {
    out.reference_doctype = 'CRM Deal'
    out.reference_docname = data.deal_id
  }
  return out
}
