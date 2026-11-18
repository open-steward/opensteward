import type { Deal } from '../../../schema/deal'

export interface RawHubSpotDeal {
  id: string
  properties: {
    dealname?: string
    amount?: string
    closedate?: string
    dealstage?: string
    pipeline?: string
    hubspot_owner_id?: string
    hs_probability?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

export function transformDeal(
  raw: RawHubSpotDeal,
  contactId?: string,
): Deal {
  const amount = raw.properties.amount != null
    ? parseFloat(raw.properties.amount)
    : undefined
  const probability = raw.properties.hs_probability != null
    ? parseFloat(raw.properties.hs_probability)
    : undefined

  return {
    id: String(raw.id),
    title: raw.properties.dealname ?? '',
    value: amount != null && !isNaN(amount)
      ? { amount, currency: 'USD' }
      : undefined,
    stage_id: raw.properties.dealstage ?? undefined,
    pipeline_id: raw.properties.pipeline ?? undefined,
    owner_id: raw.properties.hubspot_owner_id ?? undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    close_date: raw.properties.closedate ?? undefined,
    contact_ids: contactId != null ? [contactId] : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  if (data.title !== undefined) properties.dealname = data.title
  if (data.value?.amount !== undefined) properties.amount = String(data.value.amount)
  if (data.close_date !== undefined) properties.closedate = data.close_date
  if (data.stage_id !== undefined) properties.dealstage = data.stage_id
  if (data.pipeline_id !== undefined) properties.pipeline = data.pipeline_id
  if (data.owner_id !== undefined) properties.hubspot_owner_id = data.owner_id
  if (data.probability !== undefined) properties.hs_probability = String(data.probability)
  return { properties }
}
