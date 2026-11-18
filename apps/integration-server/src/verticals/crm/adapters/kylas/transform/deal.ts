import type { Deal } from '../../../schema/deal'

// Kylas CRM deal entity (called "deals" in API)
export interface RawKylasDeal {
  id: number
  name?: string
  dealValue?: { value?: number; currency?: { currencyCode?: string } }
  status?: string
  pipelineStage?: { id?: number }
  pipeline?: { id?: number }
  companyId?: number
  associatedContacts?: Array<{ id?: number }>
  ownedBy?: { id?: number }
  closingDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawKylasDeal): Deal {
  const amount = raw.dealValue?.value
  const currency = raw.dealValue?.currency?.currencyCode ?? 'INR'

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value: amount != null ? { amount, currency } : undefined,
    status: raw.status,
    stage_id: raw.pipelineStage?.id != null ? String(raw.pipelineStage.id) : undefined,
    pipeline_id: raw.pipeline?.id != null ? String(raw.pipeline.id) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    contact_ids: raw.associatedContacts
      ?.filter((c) => c.id != null)
      .map((c) => String(c.id)) ?? undefined,
    owner_id: raw.ownedBy?.id != null ? String(raw.ownedBy.id) : undefined,
    close_date: raw.closingDate,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) {
    out.dealValue = { value: data.value.amount, currency: { currencyCode: data.value.currency ?? 'INR' } }
  }
  if (data.status !== undefined) out.status = data.status
  if (data.stage_id !== undefined) out.pipelineStage = { id: Number(data.stage_id) }
  if (data.company_id !== undefined) out.companyId = Number(data.company_id)
  if (data.close_date !== undefined) out.closingDate = data.close_date
  return out
}
