import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * A company ("account") as "Get company list" / "Get company" return it
 * (GET /api/v2/accounts). Documented properties read here: `id`, `name`,
 * `phone`, `webpage` ("Company webpage"), `noEmployees` ("Number of
 * employees"), `users` ("Account managers for this company"), `regDate`,
 * `modDate`. The sample returns `null` for unset fields.
 */
export interface RawUpsalesCompany {
  id: number | string
  name?: string | null
  phone?: string | null
  webpage?: string | null
  noEmployees?: number | null
  users?: Array<{ id: number | string }> | null
  regDate?: string | null
  modDate?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawUpsalesCompany): Company {
  // `users` is a list of account managers; only a single one is an owner.
  const managers = raw.users ?? []
  if (typeof raw.name !== 'string') {
    throw new Error(`Upsales company ${raw.id} has no name ("name String, mandatory Company name")`)
  }
  return {
    id: String(raw.id),
    name: raw.name,
    phone: raw.phone ?? undefined,
    domain: raw.webpage ?? undefined,
    size:
      typeof raw.noEmployees === 'number' &&
      Number.isInteger(raw.noEmployees) &&
      raw.noEmployees >= 0
        ? raw.noEmployees
        : undefined,
    owner_id: managers.length === 1 ? String(managers[0]!.id) : undefined,
    created_at: toIsoDatetime(raw.regDate),
    updated_at: toIsoDatetime(raw.modDate),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.webpage = data.domain
  if (data.owner_id !== undefined) out.user = { id: Number(data.owner_id) }
  return out
}
