import type { Deal } from '../../../schema/deal'

export interface RawLacrmPipelineItem {
  PipelineItemId: string
  Name?: string
  PipelineId?: string
  StatusId?: string
  ContactId?: string
  AssignedTo?: string
  Priority?: string
  Note?: string
  DateCreated?: string
  DateModified?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawLacrmPipelineItem): Deal {
  return {
    id: raw.PipelineItemId,
    title: raw.Name ?? '',
    pipeline_id: raw.PipelineId,
    stage_id: raw.StatusId,
    contact_ids: raw.ContactId ? [raw.ContactId] : undefined,
    owner_id: raw.AssignedTo,
    created_at: raw.DateCreated,
    updated_at: raw.DateModified,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Name = data.title
  if (data.pipeline_id !== undefined) out.PipelineId = data.pipeline_id
  if (data.stage_id !== undefined) out.StatusId = data.stage_id
  if (data.contact_ids?.[0] !== undefined) out.ContactId = data.contact_ids[0]
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
