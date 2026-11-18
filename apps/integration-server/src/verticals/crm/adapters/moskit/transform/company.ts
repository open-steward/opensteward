import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import { primaryPhoneNumber, refId, type MoskitEntityId, type MoskitPhone } from '../entity'

/**
 * Company.v2.yaml ("Empresa"), the fields read here.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Company.v2.yaml
 */
export interface RawMoskitCompany {
  id: number
  createdBy?: MoskitEntityId | null
  responsible?: MoskitEntityId | null
  dateCreated?: string
  name?: string
  domain?: string
  primaryPhone?: MoskitEntityId | null
  phones?: MoskitPhone[] | null
  [key: string]: unknown
}

export function transformCompany(raw: RawMoskitCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain: raw.domain || undefined,
    phone: primaryPhoneNumber(raw.primaryPhone, raw.phones),
    owner_id: refId(raw.responsible),
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.domain = data.domain
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
