import type { Activity } from '../../../schema/activity'

export interface RawInsightlyActivity {
  TASK_ID: number
  TITLE?: string
  BODY?: string
  DUE_DATE?: string
  STATUS?: string
  OWNER_USER_ID?: number | null
  CONTACT_ID?: number | null
  OPPORTUNITY_ID?: number | null
  DATE_CREATED_UTC?: string
  DATE_UPDATED_UTC?: string
  [key: string]: unknown
}

function isoUtc(date?: string): string | undefined {
  if (!date) return undefined
  return date.endsWith('Z') ? date : `${date}Z`
}

export function transformActivity(raw: RawInsightlyActivity): Activity {
  return {
    id: String(raw.TASK_ID),
    subject: raw.TITLE,
    note: raw.BODY,
    due_date: raw.DUE_DATE,
    // STATUS is preserved in metadata; map to done when completed
    done: raw.STATUS === 'COMPLETED',
    owner_id: raw.OWNER_USER_ID != null ? String(raw.OWNER_USER_ID) : undefined,
    contact_id: raw.CONTACT_ID != null ? String(raw.CONTACT_ID) : undefined,
    deal_id: raw.OPPORTUNITY_ID != null ? String(raw.OPPORTUNITY_ID) : undefined,
    created_at: isoUtc(raw.DATE_CREATED_UTC),
    updated_at: isoUtc(raw.DATE_UPDATED_UTC),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.TITLE = data.subject
  if (data.note !== undefined) out.BODY = data.note
  if (data.due_date !== undefined) out.DUE_DATE = data.due_date
  if (data.done !== undefined) out.STATUS = data.done ? 'COMPLETED' : 'NOT_STARTED'
  if (data.owner_id !== undefined) out.OWNER_USER_ID = Number(data.owner_id)
  if (data.contact_id !== undefined) out.CONTACT_ID = Number(data.contact_id)
  if (data.deal_id !== undefined) out.OPPORTUNITY_ID = Number(data.deal_id)
  return out
}
