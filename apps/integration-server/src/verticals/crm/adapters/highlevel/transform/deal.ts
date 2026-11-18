import type { Deal } from '../../../schema/deal'

interface RawHLContact {
  id?: string
}

export interface RawHighLevelDeal {
  id: string
  name?: string
  monetaryValue?: number
  pipelineId?: string
  pipelineStageId?: string
  assignedTo?: string
  status?: string
  contact?: RawHLContact
  contactId?: string
  dateAdded?: string
  dateUpdated?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawHighLevelDeal): Deal {
  const contactId = raw.contact?.id ?? raw.contactId
  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: raw.monetaryValue != null
      ? { amount: raw.monetaryValue, currency: 'USD' }
      : undefined,
    pipeline_id: raw.pipelineId,
    stage_id: raw.pipelineStageId,
    contact_ids: contactId ? [String(contactId)] : undefined,
    owner_id: raw.assignedTo,
    status: raw.status,
    created_at: raw.dateAdded,
    updated_at: raw.dateUpdated,
    metadata: raw,
  }
}

export function untransformDeal(
  data: Partial<Deal>,
  locationId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { locationId }
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.monetaryValue = data.value.amount
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.stage_id !== undefined) out.pipelineStageId = data.stage_id
  if (data.owner_id !== undefined) out.assignedTo = data.owner_id
  if (data.status !== undefined) out.status = data.status
  if (data.contact_ids?.[0] !== undefined) {
    out.contact = { id: data.contact_ids[0] }
  }
  return out
}
