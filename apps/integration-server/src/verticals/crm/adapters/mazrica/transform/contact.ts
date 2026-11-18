import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMazricaContactCustomer {
  id?: number
  name?: string
}

export interface RawMazricaContact {
  id: number
  name?: string
  email?: string
  tel?: string
  mobileTel?: string
  address?: string
  dept?: string
  position?: string
  memo?: string
  customer?: RawMazricaContactCustomer
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawMazricaContact): Contact {
  // Mazrica contacts have a single `name` field — split on first space for
  // first/last if possible; leave both undefined when name is absent.
  const fullName = raw.name?.trim() || undefined
  let firstName: string | undefined
  let lastName: string | undefined
  if (fullName) {
    const spaceIdx = fullName.indexOf(' ')
    if (spaceIdx > -1) {
      firstName = fullName.slice(0, spaceIdx)
      lastName = fullName.slice(spaceIdx + 1)
    } else {
      firstName = fullName
    }
  }

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.tel ?? undefined,
    mobile: raw.mobileTel ?? undefined,
    title: raw.position ?? undefined,
    company_id: raw.customer?.id != null ? String(raw.customer.id) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // Mazrica uses a single name field
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.tel = data.phone
  if (data.mobile !== undefined) out.mobileTel = data.mobile
  if (data.title !== undefined) out.position = data.title
  if (data.company_id !== undefined) out.customerId = Number(data.company_id)
  return out
}
