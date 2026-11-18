/**
 * Transforms between Simplicate sales records and the canonical Deal schema.
 *
 * Simplicate sales fields (from /sales/sales):
 *   id               – "sales:xxxxxxxxxxxxxxxx"
 *   subject          – deal title
 *   note             – free-text note
 *   status_id        – e.g. "salesstatus:xxxxxxxxxxxxxxxx"
 *   progress_id      – "salesprogress:xxxxxxxxxxxxxxxx" (current stage)
 *   potential_revenue – estimated deal value (number)
 *   win_likelihood   – probability 0-100 (number)
 *   start_date       – ISO 8601 date
 *   end_date         – expected close date ISO 8601
 *   person_id        – linked person (contact_ids[0])
 *   organization_id  – linked organization (company_id)
 *   linked_as_employee?.id – owner (responsible employee)
 *   created_at       – ISO 8601 datetime
 *   updated_at       – ISO 8601 datetime
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/reference/get-sales-sales/
 */
import type { Deal } from '../../../schema/deal'

export interface RawSimplicateSales {
  id: string
  subject?: string
  note?: string
  status_id?: string
  status?: { id?: string; label?: string }
  progress_id?: string
  progress?: { id?: string; label?: string }
  potential_revenue?: number | string
  win_likelihood?: number | string
  start_date?: string
  end_date?: string
  person_id?: string
  person?: { id?: string }
  organization_id?: string
  organization?: { id?: string }
  responsible_employee?: { id?: string; name?: string }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawSimplicateSales): Deal {
  const revenue = raw.potential_revenue != null
    ? parseFloat(String(raw.potential_revenue))
    : undefined
  const probability = raw.win_likelihood != null
    ? parseFloat(String(raw.win_likelihood))
    : undefined

  const personId = raw.person_id ?? raw.person?.id
  const orgId = raw.organization_id ?? raw.organization?.id
  const ownerId = raw.responsible_employee?.id
  const stageId = raw.progress_id ?? raw.progress?.id
  const statusLabel = raw.status?.label

  return {
    id: String(raw.id),
    title: raw.subject ?? '',
    status: statusLabel ?? undefined,
    stage_id: stageId ?? undefined,
    value:
      revenue != null && !isNaN(revenue)
        ? { amount: revenue, currency: 'EUR' }
        : undefined,
    probability: probability != null && !isNaN(probability) ? probability : undefined,
    close_date: raw.end_date ?? undefined,
    contact_ids: personId ? [String(personId)] : undefined,
    company_id: orgId ? String(orgId) : undefined,
    owner_id: ownerId ? String(ownerId) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.subject = data.title
  if (data.value?.amount !== undefined) out.potential_revenue = data.value.amount
  if (data.close_date !== undefined) out.end_date = data.close_date
  if (data.probability !== undefined) out.win_likelihood = data.probability
  if (data.contact_ids?.[0] !== undefined) out.person_id = data.contact_ids[0]
  if (data.company_id !== undefined) out.organization_id = data.company_id
  return out
}
