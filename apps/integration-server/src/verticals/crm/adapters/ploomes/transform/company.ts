import type { Company } from '../../../schema/company'

export interface RawPloomesCompany {
  Id: number | string
  Name?: string
  Phone?: string
  Email?: string
  OwnerId?: number | string | null
  CreateDate?: string
  LastUpdateDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawPloomesCompany): Company {
  return {
    id: String(raw.Id),
    name: raw.Name ?? '',
    phone: raw.Phone ?? undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    created_at: raw.CreateDate ?? undefined,
    updated_at: raw.LastUpdateDate ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.owner_id !== undefined) out.OwnerId = Number(data.owner_id)
  return out
}
