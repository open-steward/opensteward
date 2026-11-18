import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Tyms wire type ─────────────────────────────────────────────────────────────

export interface TymsContact {
  uuid: string
  name?: string
  email?: string
  phone?: string
  address?: string
  type?: string   // "Customer" | "Vendor" | "Employee"
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Public transform ───────────────────────────────────────────────────────────

export function transformContact(raw: TymsContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const contactType = (raw.type ?? '').toLowerCase()
  const isVendor = contactType === 'vendor'
  const isCustomer = contactType === 'customer' || !isVendor

  return {
    id: raw.uuid,
    name: raw.name || undefined,
    isCustomer,
    isSupplier: isVendor,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({ address1: raw.address }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
