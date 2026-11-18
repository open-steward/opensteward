import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * Mazrica represents activities as "actions" attached to a customer.
 * GET /customers/{customerId}/actions
 */
export interface RawMazricaActionType {
  id?: number
  name?: string
}

export interface RawMazricaAction {
  id: number
  type?: RawMazricaActionType
  subject?: string
  memo?: string
  scheduledAt?: string
  doneAt?: string
  customerId?: number
  dealId?: number
  userId?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawMazricaAction): Activity {
  return {
    id: String(raw.id),
    type: raw.type?.name ?? undefined,
    subject: raw.subject ?? undefined,
    note: raw.memo ?? undefined,
    company_id: raw.customerId != null ? String(raw.customerId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.userId != null ? String(raw.userId) : undefined,
    due_date: toIsoDatetime(raw.scheduledAt),
    done: raw.doneAt != null,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.memo = data.note
  if (data.due_date !== undefined) out.scheduledAt = data.due_date
  if (data.owner_id !== undefined) out.userId = Number(data.owner_id)
  return out
}
