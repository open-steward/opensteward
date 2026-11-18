/**
 * JobAdder Company ↔ canonical Company.
 *
 * Maps GET /companies / GET /companies/{companyId} responses.
 *
 * API fields (camelCase on the wire):
 *   companyId, name, phone, fax, website,
 *   address.{ street, city, state, postalCode, country },
 *   owner.{ userId, name },
 *   createdAt, updatedAt
 */

import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawJobAdderCompany {
  companyId: number | string
  name: string
  phone?: string
  fax?: string
  website?: string
  address?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    [key: string]: unknown
  }
  owner?: {
    userId?: number | string
    name?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawJobAdderCompany): Company {
  return {
    id: String(raw.companyId),
    name: raw.name ?? '',
    phone: raw.phone ?? undefined,
    domain: raw.website ?? undefined,
    owner_id: raw.owner?.userId != null ? String(raw.owner.userId) : undefined,
    address: raw.address
      ? {
          line1: raw.address.street ?? undefined,
          city: raw.address.city ?? undefined,
          region: raw.address.state ?? undefined,
          postalCode: raw.address.postalCode ?? undefined,
          country: raw.address.country ?? undefined,
        }
      : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.address) {
    out.address = {
      street: data.address.line1,
      city: data.address.city,
      state: data.address.region,
      postalCode: data.address.postalCode,
      country: data.address.country,
    }
  }
  return out
}
