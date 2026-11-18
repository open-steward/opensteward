import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

// wFirma contractor — covers both buyers (customers) and sellers (suppliers)
export interface WfirmaContractor {
  id?: number | string
  name?: string
  altname?: string
  nip?: string       // Polish tax ID (NIP)
  regon?: string
  pesel?: string
  tax_id_type?: string
  street?: string
  building_number?: string
  flat_number?: string
  zip?: string
  city?: string
  country?: string   // ISO 3166-1 alpha-2
  email?: string
  phone?: string
  fax?: string
  url?: string
  buyer?: boolean    // is customer
  seller?: boolean   // is supplier
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformContractor(raw: WfirmaContractor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  // Combine street + building_number + flat_number into address1
  const streetParts = [raw.street, raw.building_number, raw.flat_number].filter(Boolean)
  const address1 = streetParts.length > 0 ? streetParts.join(' ') : undefined

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    companyName: raw.name || undefined,
    identification: raw.regon || undefined,
    taxNumber: raw.nip || raw.pesel || undefined,
    isCustomer: raw.buyer ?? false,
    isSupplier: raw.seller ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1,
      city: raw.city,
      postalCode: raw.zip,
      country: raw.country,
    }),
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Contact → wFirma contractor body (for add/edit) */
export function untransformContractor(contact: Partial<Contact>): Record<string, unknown> {
  return {
    name: contact.companyName ?? contact.name,
    nip: contact.taxNumber,
    email: contact.emails?.[0]?.email,
    phone: contact.telephones?.find((t) => t.type === 'WORK' || !t.type)?.telephone,
    city: contact.billingAddress?.city,
    zip: contact.billingAddress?.postalCode,
    country: contact.billingAddress?.country,
    street: contact.billingAddress?.address1,
    buyer: contact.isCustomer ?? true,
    seller: contact.isSupplier ?? false,
  }
}
