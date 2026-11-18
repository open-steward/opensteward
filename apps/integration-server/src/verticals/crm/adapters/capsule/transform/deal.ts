import type { Deal } from '../../../schema/deal'

export interface RawCapsuleDeal {
  id: number | string
  name?: string
  description?: string
  value?: { amount?: number | string; currency?: string } | null
  probability?: number
  expectedCloseOn?: string
  currentMilestoneId?: number | string | null
  /** Associated contact/party */
  party?: { id: number | string; name?: string } | null
  owner?: { id: number | string } | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawCapsuleDeal): Deal {
  const amount = raw.value?.amount != null ? Number(raw.value.amount) : undefined

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amount != null
      ? { amount, currency: raw.value?.currency ?? 'USD' }
      : undefined,
    probability: raw.probability,
    stage_id: raw.currentMilestoneId != null ? String(raw.currentMilestoneId) : undefined,
    contact_ids: raw.party?.id != null ? [String(raw.party.id)] : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    close_date: raw.expectedCloseOn,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) {
    out.value = {
      amount: data.value.amount,
      currency: data.value.currency ?? 'USD',
    }
  }
  if (data.probability !== undefined) out.probability = data.probability
  if (data.stage_id !== undefined) out.currentMilestoneId = Number(data.stage_id)
  if (data.contact_ids?.[0] !== undefined) {
    out.party = { id: Number(data.contact_ids[0]) }
  }
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  if (data.close_date !== undefined) out.expectedCloseOn = data.close_date
  return out
}
