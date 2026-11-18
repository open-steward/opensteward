import type { Contact } from '../../../schema/contact'

// SALESmanago contact — contact data lives under `contact` property in detail,
// or as top-level fields in list responses
export interface RawSalesmanagoProp {
  [key: string]: unknown
}

export interface RawSalesmanagoPerson {
  [key: string]: unknown
}

export interface RawSaleSmanagoContact {
  contactId?: string
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  phone?: string
  fax?: string
  company?: string
  externalId?: string
  ownerId?: string
  createdOn?: number  // epoch ms
  modifiedOn?: number  // epoch ms
  properties?: Record<string, unknown>
  [key: string]: unknown
}

export function transformContact(raw: RawSaleSmanagoContact): Contact {
  // SALESmanago may return full name or split first/last
  const firstName = raw.firstName ?? (raw.name ? raw.name.toString().split(' ')[0] : undefined)
  const lastName = raw.lastName ?? (raw.name ? raw.name.toString().split(' ').slice(1).join(' ') || undefined : undefined)
  return {
    id: String(raw.contactId ?? raw.externalId ?? ''),
    first_name: firstName as string | undefined,
    last_name: lastName as string | undefined,
    name: (raw.name as string | undefined) ?? ([firstName, lastName].filter(Boolean).join(' ') || undefined),
    email: raw.email as string | undefined,
    phone: raw.phone as string | undefined,
    owner_id: raw.ownerId as string | undefined,
    created_at: raw.createdOn != null ? new Date(raw.createdOn as number).toISOString() : undefined,
    updated_at: raw.modifiedOn != null ? new Date(raw.modifiedOn as number).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.email = data.email
  if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
