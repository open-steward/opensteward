/**
 * Transform Pega CRM opportunity records to canonical Deal.
 *
 * In Pega Sales Automation, Opportunities are work cases of type
 * PegaCRM-Work-Opportunity. They are accessible via:
 *   - GET /prweb/api/v1/cases?caseTypeID=PegaCRM-Work-Opportunity (list)
 *   - GET /prweb/api/v1/cases/{ID}                                (detail)
 *   - POST /prweb/api/v1/cases                                    (create)
 *   - PUT  /prweb/api/v1/cases/{ID}                               (update)
 *
 * Key fields:
 *   pzInsKey         — case system key (serves as the ID)
 *   pyID             — business key / opportunity number
 *   pyLabel          — opportunity name / title
 *   pyValue          — opportunity value (amount)
 *   pyCurrencyCode   — ISO 4217 currency code
 *   pyStageLabel     — current stage label
 *   pyStage          — current stage ID
 *   pyStatusWork     — case status (Open-*, Resolved-Won, Resolved-Lost)
 *   pyCloseDate      — expected close date
 *   pyProbability    — win probability 0–100
 *   pyOwner          — owning operator ID
 *   AccountID        — linked account identifier
 *   ContactID        — primary contact identifier
 *   pxCreateDateTime — ISO 8601 creation timestamp
 *   pxUpdateDateTime — ISO 8601 last-updated timestamp
 */

import type { Deal } from '../../../schema/deal'
import { parsePegaDatetime } from '../utils'

export interface RawPegaOpportunity {
  pzInsKey?: string
  pyID?: string
  pyLabel?: string
  pyValue?: string | number
  pyCurrencyCode?: string
  pyStageLabel?: string
  pyStage?: string
  pyStatusWork?: string
  pyCloseDate?: string
  pyProbability?: string | number
  pyOwner?: string
  AccountID?: string
  ContactID?: string
  pxCreateDateTime?: string
  pxUpdateDateTime?: string
  pxObjClass?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawPegaOpportunity): Deal {
  const amountRaw = raw.pyValue
  // Pega stores pyValue in major units (e.g. 500.00 USD).
  // Canonical Deal.value.amount is integer minor units (e.g. 50000 cents).
  // Multiply by 100 and round to nearest integer to convert.
  const amountMajor =
    amountRaw != null
      ? (typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw)))
      : undefined
  const amount =
    amountMajor != null && !isNaN(amountMajor)
      ? Math.round(amountMajor * 100)
      : undefined

  const probRaw = raw.pyProbability
  const probability =
    probRaw != null
      ? (typeof probRaw === 'number' ? probRaw : parseFloat(String(probRaw)))
      : undefined

  const currency = raw.pyCurrencyCode ?? 'USD'
  const status = raw.pyStatusWork ?? undefined

  return {
    id: String(raw.pzInsKey ?? raw.pyID ?? ''),
    title: raw.pyLabel ?? '',
    value:
      amount != null
        ? { amount, currency }
        : undefined,
    status,
    stage: raw.pyStageLabel ?? undefined,
    stage_id: raw.pyStage ?? undefined,
    owner_id: raw.pyOwner ?? undefined,
    company_id: raw.AccountID ? String(raw.AccountID) : undefined,
    contact_ids:
      raw.ContactID ? [String(raw.ContactID)] : undefined,
    probability:
      probability != null && !isNaN(probability) ? probability : undefined,
    close_date: parsePegaDatetime(raw.pyCloseDate),
    created_at: parsePegaDatetime(raw.pxCreateDateTime),
    updated_at: parsePegaDatetime(raw.pxUpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  if (data.title !== undefined) content.pyLabel = data.title
  if (data.value?.amount !== undefined) {
    // Canonical amount is integer minor units; Pega expects major units (e.g. 50000 cents → "500.00")
    content.pyValue = String((data.value.amount / 100).toFixed(2))
  }
  if (data.value?.currency !== undefined) content.pyCurrencyCode = data.value.currency
  if (data.close_date !== undefined) content.pyCloseDate = data.close_date
  if (data.stage_id !== undefined) content.pyStage = data.stage_id
  if (data.owner_id !== undefined) content.pyOwner = data.owner_id
  if (data.probability !== undefined) content.pyProbability = String(data.probability)
  if (data.company_id !== undefined) content.AccountID = data.company_id
  if (data.contact_ids?.[0] !== undefined) content.ContactID = data.contact_ids[0]
  return { content }
}
