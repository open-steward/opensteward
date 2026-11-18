/**
 * Clarify "task" object type — maps to canonical Activity.
 *
 * Attributes: title (subject), notes (body), due_date, status, type,
 *   contact_id, company_id, deal_id, owner_id, created_at, updated_at
 */

import type { Activity } from '../../../schema/activity'

export interface RawClarifyTaskAttributes {
  title?: string
  notes?: string
  due_date?: string
  status?: string
  type?: string
  contact_id?: string
  company_id?: string
  deal_id?: string
  owner_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawClarifyTask {
  id: string
  type?: string
  attributes: RawClarifyTaskAttributes
  [key: string]: unknown
}

export function transformActivity(raw: RawClarifyTask): Activity {
  const a = raw.attributes
  return {
    id: String(raw.id),
    type: a.type ?? 'task',
    subject: a.title ?? undefined,
    note: a.notes ?? undefined,
    contact_id: a.contact_id ?? undefined,
    company_id: a.company_id ?? undefined,
    deal_id: a.deal_id ?? undefined,
    owner_id: a.owner_id ?? undefined,
    due_date: a.due_date ?? undefined,
    done: a.status === 'completed' || a.status === 'done',
    created_at: a.created_at ?? undefined,
    updated_at: a.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.subject !== undefined) attributes.title = data.subject
  if (data.note !== undefined) attributes.notes = data.note
  if (data.due_date !== undefined) attributes.due_date = data.due_date
  if (data.owner_id !== undefined) attributes.owner_id = data.owner_id
  if (data.contact_id !== undefined) attributes.contact_id = data.contact_id
  if (data.company_id !== undefined) attributes.company_id = data.company_id
  if (data.deal_id !== undefined) attributes.deal_id = data.deal_id
  if (data.type !== undefined) attributes.type = data.type
  if (data.done !== undefined) {
    attributes.status = data.done ? 'completed' : 'pending'
  }
  return {
    data: {
      type: 'task',
      attributes,
    },
  }
}
