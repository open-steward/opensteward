import type { Deal } from '../../../schema/deal'

export interface RawTeamleaderDeal {
  id: string
  title?: string
  value?: { amount?: number; currency?: string }
  phase?: { id?: string }
  lead?: { customer?: { type?: string; id?: string } }
  [key: string]: unknown
}

export function transformDeal(raw: RawTeamleaderDeal): Deal {
  const amount = raw.value?.amount

  return {
    id: raw.id,
    title: raw.title ?? '',
    value: amount != null
      ? { amount, currency: raw.value?.currency ?? 'EUR' }
      : undefined,
    stage_id: raw.phase?.id ?? undefined,
    contact_ids: raw.lead?.customer?.type === 'contact' && raw.lead?.customer?.id
      ? [raw.lead.customer.id]
      : undefined,
    company_id: raw.lead?.customer?.type === 'company' && raw.lead?.customer?.id
      ? raw.lead.customer.id
      : undefined,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.title = data.title
  if (data.value?.amount !== undefined) {
    out.value = { amount: data.value.amount, currency: data.value.currency ?? 'EUR' }
  }
  if (data.stage_id !== undefined) out.phase = { id: data.stage_id }
  return out
}
