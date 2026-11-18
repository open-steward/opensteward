import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

// ── Built Accounting raw types ────────────────────────────────────────────────

/** Customer object from GET /api/v3/clients or GET /api/v3/clients/:id */
export interface BuiltAfricaClient {
  id: number
  owner_id?: number
  business_id?: number
  first_name?: string
  last_name?: string
  phone_number?: string
  business_name?: string
  business_address?: string
  business_phone?: string
  business_email?: string
  business_location?: string
  account_id?: number
  category_id?: number
  archived?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/** Supplier object from GET /api/v3/suppliers or GET /api/v3/suppliers/:id */
export interface BuiltAfricaSupplier {
  id: number
  owner_id?: number
  business_id?: number
  supplier_name?: string
  supplier_email?: string
  supplier_address?: string
  supplier_phone?: string
  supplier_location?: string
  bank_code?: string
  bank_id?: number
  account_name?: string
  account_number?: string
  account_id?: number
  archived?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Transform: Customer (client) ──────────────────────────────────────────────

export function transformClient(raw: BuiltAfricaClient): Contact {
  const name = composeName(raw.business_name, raw.first_name, raw.last_name)
  const emails = toWorkEmail(raw.business_email)
  const telephones: Telephone[] = []
  if (raw.phone_number) telephones.push({ telephone: raw.phone_number, type: 'MOBILE' })
  if (raw.business_phone) telephones.push({ telephone: raw.business_phone, type: 'WORK' })

  return {
    id: `cust_${raw.id}`,
    name: name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.business_name || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: !raw.archived,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.business_address || raw.business_location,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Transform: Supplier ───────────────────────────────────────────────────────

export function transformSupplier(raw: BuiltAfricaSupplier): Contact {
  const emails = toWorkEmail(raw.supplier_email)
  const telephones: Telephone[] = []
  if (raw.supplier_phone) telephones.push({ telephone: raw.supplier_phone, type: 'WORK' })

  return {
    id: `supp_${raw.id}`,
    name: raw.supplier_name || undefined,
    companyName: raw.supplier_name || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: !raw.archived,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.supplier_address || raw.supplier_location,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
