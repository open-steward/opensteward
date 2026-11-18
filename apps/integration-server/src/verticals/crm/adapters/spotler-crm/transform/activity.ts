import type { Activity } from '../../../schema/activity'

/**
 * An activity `record`. https://support.reallysimplesystems.com/api-v4/ gives
 * no activity field list (fields come from `GET /datadictionary/activities`
 * on a live account); it documents only that every record type is read by id
 * ("GET /{object_name}/12345 Above will return the record which has the ID of
 * 12345"). So only `id` is mapped and the rest of the record is `metadata`.
 */
export interface RawSpotlerActivity {
  id: number
  [key: string]: unknown
}

export function transformActivity(raw: RawSpotlerActivity): Activity {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.description = data.subject
  if (data.type !== undefined) out.tasktype = data.type
  if (data.due_date !== undefined) out.duedate = data.due_date
  if (data.done !== undefined) out.done = data.done
  if (data.contact_id !== undefined) out.contactid = Number(data.contact_id)
  return out
}
