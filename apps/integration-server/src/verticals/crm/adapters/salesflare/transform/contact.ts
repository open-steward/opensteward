import type { Contact } from '../../../schema/contact'

export interface RawSalesflareContact {
  id: number
  firstname?: string
  lastname?: string
  email?: string | string[]
  phone_number?: string
  account_id?: number
  owner?: { id: number; name?: string } | null
  tags?: string[]
  creation_time?: string
  modification_time?: string
  [key: string]: unknown
}

function extractEmail(email: string | string[] | undefined): string | undefined {
  if (!email) return undefined
  if (Array.isArray(email)) return email[0]
  return email
}

export function transformContact(raw: RawSalesflareContact): Contact {
  const firstName = raw.firstname
  const lastName = raw.lastname
  const name = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name,
    email: extractEmail(raw.email),
    phone: raw.phone_number,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    tags: raw.tags,
    created_at: raw.creation_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone_number = data.phone
  if (data.company_id !== undefined) out.account_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
