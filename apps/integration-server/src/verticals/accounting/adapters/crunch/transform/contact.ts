import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Crunch wire types ─────────────────────────────────────────────────────────

export interface CrunchAddressDto {
  line1?: string
  line2?: string
  line3?: string
  line4?: string
  postCode?: string
  country?: string
}

/** CustomerDto from GET /clients/{id} */
export interface CrunchCustomerDto {
  id?: number
  name?: string
  email?: string
  paymentTermsDays?: number
  billingAddress?: CrunchAddressDto
  note?: { id?: number; text?: string }
  [key: string]: unknown
}

/** SupplierDto from GET /expenses/suppliers/{id} */
export interface CrunchSupplierDto {
  id?: number
  companyName?: string
  contactName?: string
  deletable?: boolean
  archived?: boolean
  country?: string
  vatRegistrationNumber?: string
  expenseType?: { expenseTypeName?: string; expenseTypeDisplayableName?: string }
  [key: string]: unknown
}

// ── Address helper ────────────────────────────────────────────────────────────

function mapAddr(addr: CrunchAddressDto | undefined): Address | undefined {
  if (!addr) return undefined
  const any = addr.line1 ?? addr.line2 ?? addr.line3 ?? addr.line4 ?? addr.postCode ?? addr.country
  if (!any) return undefined
  return {
    address1: addr.line1 ?? undefined,
    address2: addr.line2 ?? undefined,
    city: addr.line3 ?? undefined, // Crunch doesn't expose a dedicated city field
    postalCode: addr.postCode ?? undefined,
    country: addr.country ?? undefined,
  }
}

// ── Customer (client) transform ───────────────────────────────────────────────

export function transformCustomer(raw: CrunchCustomerDto): Contact {
  const emails: Email[] = raw.email ? [{ email: raw.email, type: 'WORK' }] : []

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    billingAddress: mapAddr(raw.billingAddress),
    metadata: raw as Record<string, unknown>,
  }
}

/** Serialize a canonical Contact for POST/PUT to Crunch /clients. */
export function untransformCustomer(contact: Partial<Contact>): Record<string, unknown> {
  return {
    name: contact.name,
    email: contact.emails?.[0]?.email,
    billingAddress: contact.billingAddress
      ? {
          line1: contact.billingAddress.address1,
          line2: contact.billingAddress.address2,
          postCode: contact.billingAddress.postalCode,
          country: contact.billingAddress.country,
        }
      : undefined,
  }
}

// ── Supplier transform ────────────────────────────────────────────────────────

export function transformSupplier(raw: CrunchSupplierDto): Contact {
  const telephones: Telephone[] = []
  return {
    id: raw.id !== undefined ? `sup_${raw.id}` : undefined,
    name: raw.companyName ?? raw.contactName ?? undefined,
    companyName: raw.companyName ?? undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: !raw.archived,
    telephones: telephones.length ? telephones : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Serialize a canonical Contact for POST/PUT to Crunch /expenses/suppliers. */
export function untransformSupplier(contact: Partial<Contact>): Record<string, unknown> {
  return {
    companyName: contact.companyName ?? contact.name,
    contactName: contact.name,
    country: contact.billingAddress?.country,
  }
}
