import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMazricaCustomer {
  id: number
  name?: string
  address?: string
  telNo?: string
  webUrl?: string
  employee?: number
  capital?: number
  closingMonth?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawMazricaCustomer): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.telNo ?? undefined,
    domain: raw.webUrl ?? undefined,
    size: typeof raw.employee === 'number' && raw.employee >= 0 ? raw.employee : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.telNo = data.phone
  if (data.domain !== undefined) out.webUrl = data.domain
  if (data.size !== undefined) out.employee = data.size
  return out
}
