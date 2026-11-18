/**
 * MineralTree vendor → canonical Contact transform.
 *
 * MineralTree is an AP-automation platform; all contacts are suppliers/vendors.
 * The API returns vendors from /mtapi/base/services/vendor/{companyId}.
 *
 * Address: MineralTree normalizes to address1-address5, town, postalCode,
 * ctrySubDivision (state), country (3-letter ISO-3166).
 */

import type { Contact, ContactPaymentMethod } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

interface MtAddress {
  address1?: string
  address2?: string
  address3?: string
  town?: string
  postalCode?: string
  ctrySubDivision?: string
  country?: string
  [key: string]: unknown
}

interface MtFundingMethod {
  id?: string
  type?: string       // ACH | CREDITCARD | UNKNOWN
  status?: string
  bankAccount?: { accountNumber?: string; routingNumber?: string }
  [key: string]: unknown
}

export interface MtVendor {
  id?: string
  externalId?: string
  name?: string
  taxId?: string
  vatNumber?: string
  active?: boolean
  vendorType?: string  // NONPROFIT | CORPORATION | SOLE_PROPRIETORSHIP | INDIVIDUAL | SUBSIDIARY
  address?: MtAddress
  remittanceEmails?: string[]
  fundingMethods?: MtFundingMethod[]
  [key: string]: unknown
}

function mapPaymentMethod(fm: MtFundingMethod): ContactPaymentMethod {
  const type = (fm.type ?? '').toUpperCase()
  return {
    type: type === 'ACH' ? 'ACH' : type === 'CREDITCARD' ? 'CARD' : 'OTHER',
    externalId: fm.id || undefined,
  }
}

export function transformVendor(raw: MtVendor): Contact {
  const emails = toWorkEmail(raw.remittanceEmails?.[0])
  const telephones: Telephone[] = []

  const billingAddress = raw.address
    ? toAddress({
        address1: raw.address.address1,
        address2: raw.address.address2,
        city: raw.address.town,
        postalCode: raw.address.postalCode,
        region: raw.address.ctrySubDivision,
        // MineralTree uses 3-letter ISO country; pass through (callers can normalise)
        country: raw.address.country ? raw.address.country.slice(0, 2) : undefined,
      })
    : undefined

  const paymentMethods = (raw.fundingMethods ?? []).map(mapPaymentMethod)

  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    identification: raw.externalId || undefined,
    taxNumber: raw.taxId ?? raw.vatNumber ?? undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.active ?? true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    paymentMethods: paymentMethods.length ? paymentMethods : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
