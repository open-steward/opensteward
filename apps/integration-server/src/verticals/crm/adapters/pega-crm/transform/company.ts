/**
 * Transform Pega CRM account data page records to canonical Company.
 *
 * Pega Sales Automation stores accounts (companies) in the
 * PegaCRM-Entity-Account class. Records are retrieved via the
 * D_crmAccountList and D_crmAccount data pages.
 *
 * Key fields:
 *   pyID              — platform account identifier
 *   pyGUID            — global unique identifier
 *   AccountName       — company / account name
 *   Website           — company website / domain
 *   Phone             — account phone number
 *   NumberOfEmployees — employee count
 *   Industry          — industry classification
 *   pxCreateDateTime  — ISO 8601 creation timestamp
 *   pxUpdateDateTime  — ISO 8601 last-updated timestamp
 */

import type { Company } from '../../../schema/company'
import { parsePegaDatetime } from '../utils'

export interface RawPegaAccount {
  pyID?: string
  pyGUID?: string
  AccountName?: string
  Name?: string
  Website?: string
  Phone?: string
  NumberOfEmployees?: string | number
  Industry?: string
  Description?: string
  pxCreateDateTime?: string
  pxUpdateDateTime?: string
  pxObjClass?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawPegaAccount): Company {
  const sizeRaw = raw.NumberOfEmployees
  const size =
    sizeRaw != null
      ? (typeof sizeRaw === 'number' ? sizeRaw : parseInt(String(sizeRaw), 10))
      : undefined

  return {
    id: String(raw.pyID ?? raw.pyGUID ?? ''),
    name: raw.AccountName ?? raw.Name ?? '',
    domain: raw.Website ?? undefined,
    phone: raw.Phone ?? undefined,
    size: size != null && !isNaN(size) ? size : undefined,
    created_at: parsePegaDatetime(raw.pxCreateDateTime),
    updated_at: parsePegaDatetime(raw.pxUpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.AccountName = data.name
  if (data.domain !== undefined) out.Website = data.domain
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.size !== undefined) out.NumberOfEmployees = String(data.size)
  return { content: out }
}
