/**
 * Transform Gainsight CTA (Call-To-Action) <-> canonical Activity.
 *
 * Gainsight CTAs are the closest analogue to CRM activities/tasks.
 * Key CTA fields returned by the list API:
 *   gsid, name, DueDate, status (name), type (name), priority (name),
 *   ownerId, ownerName, companyId, companyName
 *
 * Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Cockpit_API/Call_To_Action_(CTA)_API_Documentation
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawGainsightCta {
  gsid?: string
  name?: string
  DueDate?: string
  /** Status object or plain string name */
  status?: string | { name?: string }
  /** Type object or plain string name */
  type?: string | { name?: string }
  /** Priority object or plain string name */
  priority?: string | { name?: string }
  ownerId?: string
  ownerName?: string
  /** Company GSID */
  companyId?: string
  companyName?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function pickName(v: string | { name?: string } | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  return v.name ?? undefined
}

export function transformActivity(raw: RawGainsightCta): Activity {
  const statusName = pickName(raw.status)
  return {
    id: String(raw.gsid ?? ''),
    type: pickName(raw.type),
    subject: raw.name ?? undefined,
    company_id: raw.companyId ? String(raw.companyId) : undefined,
    owner_id: raw.ownerId ? String(raw.ownerId) : undefined,
    due_date: toIsoDatetime(raw.DueDate),
    done: statusName ? statusName.toLowerCase() === 'closed' : undefined,
    created_at: toIsoDatetime(raw.createdDate),
    updated_at: toIsoDatetime(raw.modifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(
  data: Partial<Activity>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.Name = data.subject
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.DueDate = data.due_date?.slice(0, 10)
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.done !== undefined) out.status = data.done ? 'Closed' : 'Open'
  return out
}
