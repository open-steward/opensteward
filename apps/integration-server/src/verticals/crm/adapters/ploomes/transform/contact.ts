import type { Contact } from '../../../schema/contact'

export interface RawPloomesContact {
  Id: number | string
  Name?: string
  Email?: string
  Phone?: string
  OtherProperties?: Array<{ FieldKey?: string; TextValue?: string }>
  AccountId?: number | string | null
  OwnerId?: number | string | null
  CreateDate?: string
  LastUpdateDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawPloomesContact): Contact {
  return {
    id: String(raw.Id),
    name: raw.Name ?? undefined,
    email: raw.Email ?? undefined,
    phone: raw.Phone ?? undefined,
    company_id: raw.AccountId != null ? String(raw.AccountId) : undefined,
    owner_id: raw.OwnerId != null ? String(raw.OwnerId) : undefined,
    created_at: raw.CreateDate ?? undefined,
    updated_at: raw.LastUpdateDate ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.email !== undefined) out.Email = data.email
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.company_id !== undefined) out.AccountId = Number(data.company_id)
  if (data.owner_id !== undefined) out.OwnerId = Number(data.owner_id)
  return out
}
