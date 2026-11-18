/**
 * SAP Sales Cloud V2 — Opportunity (Deal) transform.
 *
 * SAP Sales Cloud V2 refers to deals as "opportunities" in the REST API
 * (service: SalesSvcCloudV2_opportunity).
 * Endpoint: GET /sap/c4c/api/v1/opportunity-service/opportunities
 *
 * Key fields:
 *   id                  — system UUID
 *   name                — opportunity display name
 *   expectedRevenue     — expected deal value; SAP returns major-unit decimal
 *                         (e.g. 120000.00 for $120,000).  The canonical
 *                         Money.amount field in the CRM schema is also a
 *                         decimal major-unit number, so no conversion needed.
 *   currencyCode        — ISO 4217 currency code (e.g. USD)
 *   salesPhaseCode      — current sales phase code (stage ID)
 *   salesPhaseName      — human-readable stage label
 *   closingDate         — expected close date (ISO-8601 date or datetime)
 *   winProbability      — win probability 0–100
 *   accountId           — linked account UUID
 *   primaryContactId    — primary contact UUID
 *   ownerId             — assigned owner UUID
 *   statusCode          — open / won / lost indicator
 *   createdAt           — ISO-8601 creation timestamp (may lack timezone offset)
 *   lastModifiedAt      — ISO-8601 last-modified timestamp (may lack timezone offset)
 */
import type { Deal } from '../../../schema/deal'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSapOpportunity {
  id: string
  name?: string
  expectedRevenue?: number | string
  currencyCode?: string
  salesPhaseCode?: string
  salesPhaseName?: string
  closingDate?: string
  winProbability?: number | string
  accountId?: string
  primaryContactId?: string
  ownerId?: string
  statusCode?: string
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

function parseNumber(v: number | string | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return !isNaN(n) ? n : undefined
}

/** Map SAP statusCode to a simple open/won/lost string. */
function mapStatus(code: string | undefined): string | undefined {
  if (!code) return undefined
  const c = code.toLowerCase()
  if (c === '1' || c === 'open') return 'open'
  if (c === '3' || c === 'won') return 'won'
  if (c === '4' || c === 'lost') return 'lost'
  return code
}

export function transformDeal(raw: RawSapOpportunity): Deal {
  const amount = parseNumber(raw.expectedRevenue)
  const probability = parseNumber(raw.winProbability)

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value:
      amount != null
        ? { amount, currency: raw.currencyCode ?? 'USD' }
        : undefined,
    status: mapStatus(raw.statusCode),
    stage: raw.salesPhaseName ?? undefined,
    stage_id: raw.salesPhaseCode ?? undefined,
    close_date: toIsoDatetime(raw.closingDate),
    probability:
      probability != null && probability >= 0 && probability <= 100
        ? probability
        : undefined,
    company_id: raw.accountId ?? undefined,
    contact_ids:
      raw.primaryContactId != null ? [raw.primaryContactId] : undefined,
    owner_id: raw.ownerId ?? undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.expectedRevenue = data.value.amount
  if (data.value?.currency !== undefined) out.currencyCode = data.value.currency
  if (data.stage_id !== undefined) out.salesPhaseCode = data.stage_id
  if (data.close_date !== undefined) out.closingDate = data.close_date
  if (data.probability !== undefined) out.winProbability = data.probability
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
