import type { Contact } from '../../../schema/contact'

export interface RawWeclappCustomer {
  id: string
  company?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  partyType?: string
  salesManager?: { id: string } | null
  [key: string]: unknown
}

export function transformContact(raw: RawWeclappCustomer): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || raw.company || undefined,
    email: raw.email,
    phone: raw.phone,
    owner_id: raw.salesManager?.id ? String(raw.salesManager.id) : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { partyType: 'PERSON' }
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
