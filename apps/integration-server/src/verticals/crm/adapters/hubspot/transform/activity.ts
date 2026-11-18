import type { Activity } from '../../../schema/activity'

export interface RawHubSpotTask {
  id: string
  properties: {
    hs_task_subject?: string
    hs_task_body?: string
    hs_task_due_date?: string
    hs_task_status?: string
    hubspot_owner_id?: string
    hs_task_type?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

export function transformActivity(raw: RawHubSpotTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.properties.hs_task_subject ?? undefined,
    note: raw.properties.hs_task_body ?? undefined,
    owner_id: raw.properties.hubspot_owner_id ?? undefined,
    due_date: raw.properties.hs_task_due_date ?? undefined,
    done: raw.properties.hs_task_status === 'COMPLETED',
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (data.subject !== undefined) properties.hs_task_subject = data.subject
  if (data.note !== undefined) properties.hs_task_body = data.note
  if (data.due_date !== undefined) properties.hs_task_due_date = data.due_date
  if (data.owner_id !== undefined) properties.hubspot_owner_id = data.owner_id
  if (data.done !== undefined) {
    properties.hs_task_status = data.done ? 'COMPLETED' : 'NOT_STARTED'
  }
  return { properties }
}
