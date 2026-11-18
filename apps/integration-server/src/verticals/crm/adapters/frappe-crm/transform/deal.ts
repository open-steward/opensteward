/**
 * Transform Frappe CRM Deal → canonical Deal.
 *
 * Key Frappe CRM Deal fields:
 *   name                  — Frappe doc name (unique ID)
 *   lead_name             — deal title / lead name
 *   organization          — linked CRM Organization
 *   status                — linked CRM Deal Status (Open, Won, Lost, …)
 *   deal_owner            — linked User
 *   probability           — percent (0–100)
 *   deal_value            — currency
 *   currency              — currency code
 *   expected_closure_date — date (YYYY-MM-DD)
 *   closed_date           — date (YYYY-MM-DD)
 *   creation              — ISO datetime
 *   modified              — ISO datetime
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'

export interface RawFrappeDeal {
  name: string
  lead_name?: string
  organization?: string
  status?: string
  deal_owner?: string
  probability?: number | string
  deal_value?: number | string
  currency?: string
  expected_closure_date?: string
  closed_date?: string
  creation?: string
  modified?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawFrappeDeal): Deal {
  const probabilityRaw = raw.probability != null ? Number(raw.probability) : undefined
  const probability =
    probabilityRaw != null && !isNaN(probabilityRaw) ? probabilityRaw : undefined

  const amountRaw = raw.deal_value != null ? Number(raw.deal_value) : undefined
  const amount = amountRaw != null && !isNaN(amountRaw) && amountRaw > 0 ? amountRaw : undefined

  // Frappe dates are YYYY-MM-DD; append T00:00:00Z to make strict ISO-8601
  const toIso = (d?: string): string | undefined => {
    if (!d) return undefined
    if (d.includes('T')) return d
    return `${d}T00:00:00Z`
  }

  const status = raw.status?.toLowerCase()
  const closedDate = raw.closed_date ?? undefined

  return {
    id: String(raw.name),
    title: raw.lead_name ?? '',
    status: status,
    company_id: raw.organization ? String(raw.organization) : undefined,
    owner_id: raw.deal_owner ?? undefined,
    probability,
    value:
      amount != null
        ? { amount, currency: raw.currency ?? 'USD' }
        : undefined,
    close_date: toIso(raw.expected_closure_date) ?? toIso(closedDate),
    created_at: toIsoDatetime(raw.creation),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.lead_name = data.title
  if (data.status !== undefined) out.status = data.status
  if (data.owner_id !== undefined) out.deal_owner = data.owner_id
  if (data.company_id !== undefined) out.organization = data.company_id
  if (data.probability !== undefined) out.probability = data.probability
  if (data.value?.amount !== undefined) out.deal_value = data.value.amount
  if (data.value?.currency !== undefined) out.currency = data.value.currency
  if (data.close_date !== undefined) {
    // Strip time portion if present — Frappe expects YYYY-MM-DD
    out.expected_closure_date = data.close_date.split('T')[0]
  }
  return out
}
