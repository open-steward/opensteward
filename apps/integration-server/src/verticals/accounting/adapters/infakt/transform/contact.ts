import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

/**
 * inFakt client (customer).
 *
 * inFakt only has "clients" (customers). There is no separate supplier entity
 * in the API — all contacts map to isCustomer=true.
 *
 * Identifier: numeric id (returned as number in API, stored as string).
 */

export interface InfaktClient {
  id: number
  company_name: string | null
  first_name: string | null
  last_name: string | null
  nip: string | null
  email: string | null
  phone_number: string | null
  street: string | null
  street_number: string | null
  flat_number: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  web_site: string | null
  payment_method: string | null
  note: string | null
  [key: string]: unknown
}

export function transformContact(raw: InfaktClient): Contact {
  const emails = toWorkEmail(raw.email ?? undefined)
  const telephones: Telephone[] = []
  if (raw.phone_number) telephones.push({ telephone: raw.phone_number, type: 'WORK' })

  // Build street address: street + street_number (+ /flat_number if present)
  const streetParts = [raw.street, raw.street_number].filter(Boolean)
  const address1 = streetParts.length ? streetParts.join(' ') : undefined
  const address2 = raw.flat_number ? `Apt ${raw.flat_number}` : undefined

  return {
    id: String(raw.id),
    name: composeName(raw.company_name, raw.first_name, raw.last_name),
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.nip || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1,
      address2,
      city: raw.city ?? undefined,
      postalCode: raw.postal_code ?? undefined,
      country: raw.country ?? undefined,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Contact → inFakt client body (for create/update)
export function untransformContact(contact: Partial<Contact>): Record<string, unknown> {
  return {
    company_name: contact.companyName ?? (contact.isCustomer ? contact.name : undefined),
    first_name: contact.firstName,
    last_name: contact.lastName,
    nip: contact.taxNumber,
    email: contact.emails?.[0]?.email,
    phone_number: contact.telephones?.[0]?.telephone,
    street: contact.billingAddress?.address1,
    city: contact.billingAddress?.city,
    postal_code: contact.billingAddress?.postalCode,
    country: contact.billingAddress?.country ?? 'PL',
  }
}
