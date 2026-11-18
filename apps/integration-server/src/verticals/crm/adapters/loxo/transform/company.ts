import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * Raw Loxo company response shape.
 */
export interface RawLoxoCompany {
  id: number | string
  name?: string
  url?: string
  description?: string
  company_type_id?: number | string | null
  company_global_status_id?: number | string | null
  /** Array of phone objects. */
  phones?: Array<{ number?: string; is_primary?: boolean; [k: string]: unknown }>
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function pickPhone(phones?: RawLoxoCompany['phones']): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const primary = phones.find((p) => p.is_primary)
  return (primary ?? phones[0])?.number ?? undefined
}

export function transformCompany(raw: RawLoxoCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain: raw.url ?? undefined,
    phone: pickPhone(raw.phones),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.url = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
