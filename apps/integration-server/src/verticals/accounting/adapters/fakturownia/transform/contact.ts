/**
 * Fakturownia ↔ canonical Contact transform.
 *
 * Fakturownia uses a single "clients" endpoint for both customers and
 * suppliers (kind: "buyer" | "seller" | "both").
 *
 * Key Fakturownia client fields:
 *   id, name, shortcut, first_name, last_name,
 *   tax_no, register_number,
 *   email, phone, mobile_phone, fax, www,
 *   street, city, post_code, country,
 *   company (boolean), kind ("buyer"|"seller"|"both"),
 *   disable (soft-deleted flag)
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

// ── Raw Fakturownia type ──────────────────────────────────────────────────────

export interface FakturowniaClient {
  id: number | string
  name?: string
  shortcut?: string
  first_name?: string
  last_name?: string
  tax_no?: string
  register_number?: string
  email?: string
  phone?: string
  mobile_phone?: string
  fax?: string
  www?: string
  street?: string
  city?: string
  post_code?: string
  country?: string
  company?: boolean
  kind?: string          // "buyer" | "seller" | "both"
  disable?: boolean
  currency?: string
  [key: string]: unknown
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformClient(raw: FakturowniaClient): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })
  if (raw.mobile_phone) telephones.push({ telephone: raw.mobile_phone, type: 'MOBILE' })
  if (raw.fax) telephones.push({ telephone: raw.fax, type: 'FAX' })

  const kind = (raw.kind ?? '').toLowerCase()
  const isBuyer = kind === 'buyer' || kind === 'both'
  const isSeller = kind === 'seller' || kind === 'both'

  const displayName = composeName(raw.name, raw.first_name, raw.last_name)

  return {
    id: String(raw.id),
    name: displayName,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company ? raw.name || undefined : undefined,
    identification: raw.register_number || undefined,
    taxNumber: raw.tax_no || undefined,
    isCustomer: isBuyer || (!isBuyer && !isSeller), // default to customer when kind unset
    isSupplier: isSeller,
    isActive: raw.disable !== true,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.post_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
