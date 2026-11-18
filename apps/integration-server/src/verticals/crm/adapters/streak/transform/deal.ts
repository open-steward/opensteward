import type { Deal } from '../../../schema/deal'

export interface RawStreakBox {
  key: string
  name: string
  pipelineKey?: string
  stageKey?: string
  assignedToSharingEntries?: Array<{ email?: string }>
  followerKeys?: string[]
  linkedBoxKeys?: string[]
  notes?: unknown[]
  fields?: Record<string, unknown>
  createdDate?: number
  lastUpdatedDate?: number
  [key: string]: unknown
}

export function transformDeal(raw: RawStreakBox): Deal {
  return {
    id: raw.key,
    title: raw.name,
    pipeline_id: raw.pipelineKey,
    stage_id: raw.stageKey,
    created_at: raw.createdDate != null ? new Date(raw.createdDate).toISOString() : undefined,
    updated_at: raw.lastUpdatedDate != null ? new Date(raw.lastUpdatedDate).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.stage_id !== undefined) out.stageKey = data.stage_id
  if (data.pipeline_id !== undefined) out.pipelineKey = data.pipeline_id
  return out
}
