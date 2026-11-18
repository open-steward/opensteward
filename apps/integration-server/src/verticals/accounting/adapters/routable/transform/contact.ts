/**
 * Transform Routable Company → canonical Contact.
 *
 * Routable uses a single "Company" object that can be a customer (receivable
 * counterparty), a vendor (payable counterparty), or both.
 *
 * Docs: https://developers.routable.com/docs/company
 */
import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

// ── Routable types ────────────────────────────────────────────────────────────

export interface RoutableAddress {
  street_address?: string
  street_address2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
  [key: string]: unknown
}

export interface RoutableContact {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  phone_number?: string
  default_contact_for_payable_and_receivable?: boolean
  default_contact_for_company_management?: boolean
  is_archived?: boolean
  [key: string]: unknown
}

export interface RoutableCompany {
  id: string
  display_name?: string
  business_name?: string
  first_name?: string
  last_name?: string
  type?: 'business' | 'personal' | string
  email?: string
  status?: string          // added | invited | accepted
  is_customer?: boolean
  is_vendor?: boolean
  registered_address?: RoutableAddress
  contacts?: RoutableContact[]
  created_at?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCompany(raw: RoutableCompany): Contact {
  const displayName = composeName(raw.business_name ?? raw.display_name, raw.first_name, raw.last_name)

  // Use the company-level email or fall back to the primary contact email
  const primaryEmail = raw.email
    ?? raw.contacts?.find((c) => c.default_contact_for_payable_and_receivable)?.email
    ?? raw.contacts?.[0]?.email

  const emails = toWorkEmail(primaryEmail)

  const primaryContact = raw.contacts?.find((c) => c.default_contact_for_payable_and_receivable)
    ?? raw.contacts?.[0]
  const phone = primaryContact?.phone_number

  const telephones = phone ? [{ telephone: phone, type: 'WORK' as const }] : []

  const addr = raw.registered_address
  const billingAddress = addr
    ? toAddress({
        address1: addr.street_address,
        address2: addr.street_address2,
        city: addr.city,
        region: addr.state,
        postalCode: addr.postal_code,
        country: addr.country,
      })
    : undefined

  return {
    id: raw.id,
    name: displayName,
    companyName: raw.business_name || undefined,
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    isCustomer: raw.is_customer ?? false,
    isSupplier: raw.is_vendor ?? false,
    isActive: raw.status === 'accepted' || raw.status === 'added',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
