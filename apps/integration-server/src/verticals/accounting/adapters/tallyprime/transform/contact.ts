/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface TallyLedger {
  NAME: string
  ADDRESS?: string
  PINCODE?: string
  STATENAME?: string
  COUNTRYNAME?: string
  EMAIL?: string
  PHONE?: string
  GSTIN?: string
  PARENT?: string
  OPENINGBALANCE?: string
  [key: string]: unknown
}

export function transformContact(raw: TallyLedger): Contact {
  const emails: Email[] = raw.EMAIL ? [{ email: raw.EMAIL }] : []
  const telephones: Telephone[] = raw.PHONE ? [{ telephone: raw.PHONE }] : []

  let billingAddress: Address | undefined
  if (raw.ADDRESS) {
    billingAddress = {
      address1: raw.ADDRESS,
      postalCode: raw.PINCODE || undefined,
      region: raw.STATENAME || undefined,
      country: toIso3166Alpha2(raw.COUNTRYNAME),
    }
  }

  return {
    id: raw.NAME,
    name: raw.NAME,
    taxNumber: raw.GSTIN || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length > 0 ? emails : undefined,
    telephones: telephones.length > 0 ? telephones : undefined,
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
