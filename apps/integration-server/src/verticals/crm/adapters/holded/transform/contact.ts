import type { Contact } from '../../../schema/contact'

export interface RawHoldedContact {
  id: string
  name?: string
  email?: string
  phone?: string
  contactNum?: string
  tags?: string[]
  [key: string]: unknown
}

export function transformContact(raw: RawHoldedContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    tags: raw.tags,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'contact' }
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
