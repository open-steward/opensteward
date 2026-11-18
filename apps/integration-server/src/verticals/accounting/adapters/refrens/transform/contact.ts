/**
 * Refrens contact transform.
 *
 * Refrens does not expose a dedicated contacts/clients/suppliers REST
 * endpoint in their public API. Contact information is embedded inside
 * invoice (billedTo) and expenditure (billedBy) records.
 *
 * This file provides a minimal transform for the billedTo/billedBy shape
 * so calling code can hydrate a Contact when needed.
 */

import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import type { Telephone } from '../../../schema/shared'

// ── Raw embedded contact shape ────────────────────────────────────────────────

export interface RefrensContactEmbedded {
  name?: string
  email?: string
  phone?: string
  gstin?: string
  panNumber?: string
  street?: string
  city?: string
  pincode?: string
  gstState?: string
  country?: string
  [key: string]: unknown
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformContact(
  raw: RefrensContactEmbedded,
  id: string,
  isCustomer: boolean,
): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  return {
    id,
    name: raw.name || undefined,
    taxNumber: raw.gstin || raw.panNumber || undefined,
    isCustomer,
    isSupplier: !isCustomer,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.street,
      city: raw.city,
      postalCode: raw.pincode,
      region: raw.gstState,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
