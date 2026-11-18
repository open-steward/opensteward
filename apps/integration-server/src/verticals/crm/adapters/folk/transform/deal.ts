import type { Deal } from '../../../schema/deal'

// ── Raw Folk types ─────────────────────────────────────────────────────────

export interface RawFolkDeal {
  id: string
  name: string
  value?: number
  currency?: string
  stageId?: string
  pipelineId?: string
  contactId?: string
  ownerId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformDeal(raw: RawFolkDeal): Deal {
  return {
    id: String(raw.id),
    title: raw.name,
    value: raw.value !== undefined
      ? { amount: raw.value, currency: raw.currency ?? 'USD' }
      : undefined,
    stage_id: raw.stageId ? String(raw.stageId) : undefined,
    pipeline_id: raw.pipelineId ? String(raw.pipelineId) : undefined,
    contact_ids: raw.contactId ? [String(raw.contactId)] : undefined,
    owner_id: raw.ownerId ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out['name'] = data.title
  if (data.value?.amount !== undefined) out['value'] = data.value.amount
  if (data.value?.currency !== undefined) out['currency'] = data.value.currency
  if (data.stage_id !== undefined) out['stageId'] = data.stage_id
  if (data.pipeline_id !== undefined) out['pipelineId'] = data.pipeline_id
  if (data.contact_ids?.[0] !== undefined) out['contactId'] = data.contact_ids[0]
  if (data.owner_id !== undefined) out['ownerId'] = data.owner_id
  return out
}
