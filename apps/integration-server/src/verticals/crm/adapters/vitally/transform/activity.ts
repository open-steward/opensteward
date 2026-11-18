import type { Activity } from '../../../schema/activity'

/**
 * Vitally REST API task object shape.
 *
 * Vitally tasks map to CRM activities.
 * Docs: https://docs.vitally.io/en/articles/9880855-rest-api-tasks
 */
export interface RawVitallyTask {
  id: string
  externalId?: string | null
  name?: string | null
  description?: string | null
  accountId?: string | null
  assignedToId?: string | null
  completedById?: string | null
  dueDate?: string | null
  completedAt?: string | null
  archivedAt?: string | null
  categoryId?: string | null
  tags?: string[]
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawVitallyTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: typeof raw.name === 'string' ? raw.name : undefined,
    note: typeof raw.description === 'string' ? raw.description : undefined,
    company_id: typeof raw.accountId === 'string' ? raw.accountId : undefined,
    owner_id: typeof raw.assignedToId === 'string' ? raw.assignedToId : undefined,
    due_date: typeof raw.dueDate === 'string' ? raw.dueDate : undefined,
    done: typeof raw.completedAt === 'string' && raw.completedAt !== null,
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.due_date !== undefined) out.dueDate = data.due_date
  return out
}
