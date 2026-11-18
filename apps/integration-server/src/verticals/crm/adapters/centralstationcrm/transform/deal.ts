/**
 * Transform CentralStationCRM "deal" (project/offer) objects to/from canonical Deal.
 *
 * Wire shape (GET /deals.json or /deals/{id}.json with ?includes=companies contact_details):
 * {
 *   deal: {
 *     id, name, background, user_id, status,
 *     value, currency,
 *     created_at, updated_at,
 *     companies: [{ company: { id, name } }],
 *     contact_details: [{ atype, value }]
 *   }
 * }
 *
 * status values: "open" | "won" | "lost" | "closed"
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Deal } from '../../../schema/deal'
import type {
  RawCentralStationCompanyRef,
  RawCentralStationContactDetail,
} from './contact'

export interface RawCentralStationDeal {
  id: number | string
  name?: string
  background?: string
  user_id?: number | string
  status?: string
  value?: number | string
  currency?: string
  created_at?: string
  updated_at?: string
  companies?: RawCentralStationCompanyRef[]
  contact_details?: RawCentralStationContactDetail[]
  [key: string]: unknown
}

export interface RawCentralStationDealWrapper {
  deal: RawCentralStationDeal
  [key: string]: unknown
}

export function transformDeal(raw: RawCentralStationDeal): Deal {
  const primaryCompany = raw.companies?.[0]?.company
  // API returns value in major currency units (e.g. 15000 = €15,000).
  // Canonical Money.amount is integer minor units (cents): multiply by 100.
  const majorUnits = raw.value != null ? parseFloat(String(raw.value)) : undefined
  const minorUnits =
    majorUnits != null && !isNaN(majorUnits)
      ? Math.round(majorUnits * 100)
      : undefined
  const currency =
    typeof raw.currency === 'string' && raw.currency.length === 3
      ? raw.currency.toUpperCase()
      : 'EUR'

  return {
    id: String(raw.id),
    title: raw.name ?? '',
    value:
      minorUnits !== undefined
        ? { amount: minorUnits, currency }
        : undefined,
    status: raw.status ?? undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    company_id: primaryCompany?.id != null ? String(primaryCompany.id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const deal: Record<string, unknown> = {}
  if (data.title !== undefined) deal.name = data.title
  if (data.status !== undefined) deal.status = data.status
  if (data.owner_id !== undefined) deal.user_id = data.owner_id
  // Convert canonical minor units (cents) back to major units for the API.
  if (data.value?.amount !== undefined) deal.value = data.value.amount / 100
  if (data.value?.currency !== undefined) deal.currency = data.value.currency

  return { deal }
}
