import type { Deal } from '../../../schema/deal'

export interface RawLeadsquaredDeal {
  ActivityId: string
  EventName?: string
  ActivityNote?: string
  LeadId?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawLeadsquaredDeal): Deal {
  return {
    id: String(raw.ActivityId),
    title: raw.EventName ?? '',
    contact_ids: raw.LeadId ? [String(raw.LeadId)] : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.EventName = data.title
  return out
}
