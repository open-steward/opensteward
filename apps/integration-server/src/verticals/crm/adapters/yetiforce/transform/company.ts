import type { Company } from '../../../schema/company'
import { refId, str, wallTimeToIso } from '../dates'

/**
 * An Accounts record's raw data (`x-raw-data: 1`), keyed by field name.
 *
 * Field names are the `fieldname` column of YetiForce's install schema for
 * the Accounts module (tabid 6), install/install_schema/data.sql in
 * github.com/YetiForceCompany/YetiForceCRM: accountname (mandatory, V~M),
 * website, phone, industry, employees, assigned_user_id, createdtime,
 * modifiedtime.
 */
export type RawYetiForceAccount = Record<string, unknown>

/** Fields the Accounts list asks for with `x-fields`. */
export const ACCOUNT_FIELDS = [
  'accountname',
  'website',
  'phone',
  'industry',
  'employees',
  'assigned_user_id',
  'createdtime',
  'modifiedtime',
] as const

/** The host of a website URL (`https://www.acme.example/x` → `www.acme.example`), or the value as given when it has no scheme. */
function domainOf(website: string | undefined): string | undefined {
  if (!website) return undefined
  try {
    return (
      new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `http://${website}`).hostname ||
      undefined
    )
  } catch {
    return undefined
  }
}

function headcount(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export function transformCompany(
  id: string,
  raw: RawYetiForceAccount,
  rawTimeZone: string,
): Company {
  const name = raw['accountname']
  if (typeof name !== 'string' || name === '') {
    throw Object.assign(new Error(`YetiForce account ${id} has no accountname`), {
      statusCode: 502,
    })
  }
  return {
    id,
    name,
    domain: domainOf(str(raw['website'])),
    phone: str(raw['phone']),
    industry: str(raw['industry']),
    size: headcount(raw['employees']),
    owner_id: refId(raw['assigned_user_id']),
    created_at: wallTimeToIso(raw['createdtime'], rawTimeZone),
    updated_at: wallTimeToIso(raw['modifiedtime'], rawTimeZone),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['accountname'] = data.name
  if (data.domain !== undefined) out['website'] = data.domain
  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.industry !== undefined) out['industry'] = data.industry
  if (data.size !== undefined) out['employees'] = data.size
  return out
}
