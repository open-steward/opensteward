/**
 * Transform between canonical CRM Company and CAS genesisWorld Address objects.
 *
 * Companies are Address records with GWISCOMPANY='true'. The same address
 * schema is used for both person contacts and company accounts.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import type { RawCasAddress } from './contact'

export function transformCompany(raw: RawCasAddress): Company {
  // Prefer the Company field as the display name; fall back to concatenated name.
  const nameParts = [raw.FirstName, raw.LastName].filter(Boolean)
  const name = raw.Company ?? (nameParts.length > 0 ? nameParts.join(' ') : '')

  // Parse employee count from an optional custom field
  const empRaw = raw['NumberOfEmployees'] ?? raw['Employees']
  const size =
    empRaw != null && empRaw !== ''
      ? (() => {
          const n = parseInt(String(empRaw), 10)
          return isNaN(n) ? undefined : n
        })()
      : undefined

  return {
    id: String(raw.GWGUID ?? ''),
    name,
    phone: raw.Phone1 ?? undefined,
    owner_id: raw.UserGGUID ? String(raw.UserGGUID) : undefined,
    size,
    created_at: toIsoDatetime(raw.CreateDate),
    updated_at: toIsoDatetime(raw.UpdateDate),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    GWISCOMPANY: true,
  }
  if (data.name !== undefined) out.Company = data.name
  if (data.phone !== undefined) out.Phone1 = data.phone
  if (data.owner_id !== undefined) out.UserGGUID = data.owner_id
  if (data.size !== undefined) out.NumberOfEmployees = data.size
  return out
}
