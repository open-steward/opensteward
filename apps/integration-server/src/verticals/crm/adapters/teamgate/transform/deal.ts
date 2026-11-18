import type { Deal } from '../../../schema/deal'

/**
 * Teamgate deal fields from GET /v4/deals:
 *   id, name, priceValue (Double, major currency units), priceCurrency,
 *   statusName, pipelineId, pipelineName, stageId, stageName,
 *   stageProbability, buyerId (contact), estimatedClosureDate,
 *   ownerId, createdTime, updatedTime
 *
 * Money convention: Teamgate priceValue is in major units (e.g. 1200.50 USD).
 * Canonical amount is integer minor units — multiply by 100 and round.
 */
export interface RawTeamgateDeal {
  id: number | string
  name?: string
  priceValue?: number | null
  priceBaseValue?: number | null
  priceCurrency?: string
  priceBaseCurrency?: string
  statusName?: string
  pipelineId?: number | string | null
  pipelineName?: string
  stageId?: number | string | null
  stageName?: string
  stageProbability?: number | null
  buyerId?: number | string | null
  estimatedClosureDate?: string | null
  ownerId?: number | string | null
  createdTime?: string
  updatedTime?: string
  [key: string]: unknown
}

function toIso(ts: string | undefined | null): string | undefined {
  if (!ts) return undefined
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformDeal(raw: RawTeamgateDeal): Deal {
  // Prefer base (reporting) currency; fall back to deal currency
  const priceValue = raw.priceBaseValue ?? raw.priceValue
  const currency = typeof raw.priceBaseCurrency === 'string' && raw.priceBaseCurrency
    ? raw.priceBaseCurrency
    : typeof raw.priceCurrency === 'string' && raw.priceCurrency
      ? raw.priceCurrency
      : undefined

  const value =
    typeof priceValue === 'number' && currency
      ? { amount: Math.round(priceValue * 100), currency }
      : undefined

  return {
    id: String(raw.id),
    title: typeof raw.name === 'string' && raw.name ? raw.name : String(raw.id),
    value,
    status: typeof raw.statusName === 'string' && raw.statusName
      ? raw.statusName.toLowerCase()
      : undefined,
    pipeline_id: raw.pipelineId != null ? String(raw.pipelineId) : undefined,
    stage_id: raw.stageId != null ? String(raw.stageId) : undefined,
    stage: typeof raw.stageName === 'string' && raw.stageName ? raw.stageName : undefined,
    probability: typeof raw.stageProbability === 'number' ? raw.stageProbability : undefined,
    contact_ids: raw.buyerId != null ? [String(raw.buyerId)] : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    close_date: toIso(raw.estimatedClosureDate ?? undefined),
    created_at: toIso(raw.createdTime),
    updated_at: toIso(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value !== undefined) {
    // Convert from integer minor units back to major units
    out.priceValue = data.value.amount / 100
    out.priceCurrency = data.value.currency
  }
  if (data.pipeline_id !== undefined) out.pipelineId = data.pipeline_id
  if (data.stage_id !== undefined) out.stageId = data.stage_id
  if (data.close_date !== undefined) out.estimatedClosureDate = data.close_date
  return out
}
