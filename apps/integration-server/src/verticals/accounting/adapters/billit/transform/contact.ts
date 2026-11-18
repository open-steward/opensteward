/**
 * Billit Party → canonical Contact transform.
 *
 * Billit uses "parties" (/v1/parties) for both customers and suppliers.
 * PartyType = "Customer" | "Supplier" distinguishes them.
 *
 * Key fields:
 *   PartyID          — platform identifier
 *   Nr               — human-readable party number
 *   Name             — display name
 *   CommercialName   — trading name
 *   VATNumber        — tax identifier
 *   PartyType        — "Customer" or "Supplier"
 *   Addresses        — array with AddressType: "InvoiceAddress" | "DeliveryAddress"
 *
 * Docs: https://docs.billit.be/reference/party-1
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

// ── Billit wire types ─────────────────────────────────────────────────────────

export interface BillitPartyAddress {
  AddressType?: string   // "InvoiceAddress" | "DeliveryAddress"
  Name?: string
  Tav?: string
  Street?: string
  StreetNumber?: string
  Box?: string
  Zipcode?: string
  City?: string
  CountryCode?: string
  Phone?: string
  [key: string]: unknown
}

export interface BillitPartyIdentifier {
  IdentifierType?: string
  Identifier?: string
  [key: string]: unknown
}

export interface BillitParty {
  PartyID?: string
  Nr?: string
  Name?: string
  CommercialName?: string
  VATNumber?: string
  PartyType?: string    // "Customer" | "Supplier"
  Email?: string
  Phone?: string
  Language?: string
  Addresses?: BillitPartyAddress[]
  Identifiers?: BillitPartyIdentifier[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickAddress(
  addresses: BillitPartyAddress[] | undefined,
  type: string,
): BillitPartyAddress | undefined {
  return addresses?.find((a) => (a.AddressType ?? '').toLowerCase() === type.toLowerCase())
}

function addressToCanonical(addr: BillitPartyAddress | undefined) {
  if (!addr) return undefined
  const street = [addr.Street, addr.StreetNumber, addr.Box].filter(Boolean).join(' ')
  return toAddress({
    address1: street || undefined,
    city: addr.City,
    postalCode: addr.Zipcode,
    country: addr.CountryCode,
  })
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformParty(raw: BillitParty): Contact {
  const partyType = (raw.PartyType ?? '').toLowerCase()
  const isCustomer = partyType === 'customer'
  const isSupplier = partyType === 'supplier'

  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })

  const invoiceAddr = pickAddress(raw.Addresses, 'InvoiceAddress')
  const deliveryAddr = pickAddress(raw.Addresses, 'DeliveryAddress')

  // Also pick the phone from the invoice address if no top-level phone
  const addrPhone = invoiceAddr?.Phone
  if (addrPhone && !raw.Phone) {
    telephones.push({ telephone: addrPhone, type: 'WORK' })
  }

  return {
    id: raw.PartyID || raw.Nr || undefined,
    name: composeName(raw.CommercialName || raw.Name, undefined, undefined),
    companyName: raw.CommercialName || raw.Name || undefined,
    taxNumber: raw.VATNumber || undefined,
    isCustomer: isCustomer || (!isCustomer && !isSupplier) ? true : false,
    isSupplier: isSupplier,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: addressToCanonical(invoiceAddr),
    shippingAddress: addressToCanonical(deliveryAddr),
    metadata: raw as Record<string, unknown>,
  }
}
