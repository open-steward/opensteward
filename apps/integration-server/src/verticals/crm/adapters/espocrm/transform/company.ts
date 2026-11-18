import type { Company } from '../../../schema/company'
import { espoDatetimeToIso } from './datetime'
import { requireString } from './required'

// EspoCRM Account entity (maps to Company)
export interface RawEspoCrmAccount {
  id?: string
  name?: string
  phoneNumber?: string
  website?: string
  industry?: string
  assignedUserId?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawEspoCrmAccount): Company {
  return {
    id: requireString(raw.id, 'Account.id'),
    // spec.json Account_create: "required":["name"], so every Account has one.
    name: requireString(raw.name, `Account ${String(raw.id)} name`),
    phone: raw.phoneNumber,
    domain: raw.website,
    industry: raw.industry,
    owner_id: raw.assignedUserId,
    created_at: espoDatetimeToIso(raw.createdAt),
    updated_at: espoDatetimeToIso(raw.modifiedAt),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
