/**
 * Lightspeed Retail Customer → canonical Customer.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawLightspeedContactAddress {
  address1?: string
  address2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  [key: string]: unknown
}

export interface RawLightspeedContact {
  contactID?: string
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export interface RawLightspeedCustomer {
  customerID: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  createTime?: string
  timeStamp?: string
  archived?: string
  contactID?: string
  creditAccountID?: string
  customerTypeID?: string
  taxCategoryID?: string
  Contact?: {
    contactID?: string
    custom?: string
    noEmail?: string
    noPhone?: string
    noMail?: string
    Emails?: { ContactEmail?: { address?: string; useType?: string } | Array<{ address?: string; useType?: string }> }
    Phones?: { ContactPhone?: { number?: string; useType?: string } | Array<{ number?: string; useType?: string }> }
    Addresses?: { ContactAddress?: RawLightspeedContactAddress | RawLightspeedContactAddress[] }
    [key: string]: unknown
  }
  [key: string]: unknown
}

function getEmail(raw: RawLightspeedCustomer): string | undefined {
  const emails = raw.Contact?.Emails?.ContactEmail
  if (!emails) return undefined
  const arr = Array.isArray(emails) ? emails : [emails]
  const primary = arr.find((e) => e.useType === 'Primary') ?? arr[0]
  return primary?.address ?? undefined
}

function getPhone(raw: RawLightspeedCustomer): string | undefined {
  const phones = raw.Contact?.Phones?.ContactPhone
  if (!phones) return undefined
  const arr = Array.isArray(phones) ? phones : [phones]
  const primary = arr.find((p) => p.useType === 'Primary') ?? arr[0]
  return primary?.number ?? undefined
}

function getAddress(raw: RawLightspeedCustomer): Address | undefined {
  const addrs = raw.Contact?.Addresses?.ContactAddress
  if (!addrs) return undefined
  const arr = Array.isArray(addrs) ? addrs : [addrs]
  const addr = arr[0]
  if (!addr) return undefined
  const line1 = addr.address1 ?? undefined
  const line2 = addr.address2 ?? undefined
  const city = addr.city ?? undefined
  const region = addr.state ?? undefined
  const postalCode = addr.zip ?? undefined
  const country = addr.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawLightspeedCustomer): Customer {
  const noEmail = raw.Contact?.noEmail === 'true'
  return {
    id: raw.customerID,
    email: getEmail(raw),
    firstName: raw.firstName ?? undefined,
    lastName: raw.lastName ?? undefined,
    phone: getPhone(raw),
    acceptsMarketing: noEmail ? false : undefined,
    defaultAddress: getAddress(raw),
    createdAt: raw.createTime,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Lightspeed Customer body. */
export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: customer.firstName,
    lastName: customer.lastName,
  }
  if (customer.email || customer.phone || customer.defaultAddress) {
    const contact: Record<string, unknown> = {}
    if (customer.email) {
      contact['Emails'] = {
        ContactEmail: { address: customer.email, useType: 'Primary' },
      }
    }
    if (customer.phone) {
      contact['Phones'] = {
        ContactPhone: { number: customer.phone, useType: 'Primary' },
      }
    }
    if (customer.defaultAddress) {
      contact['Addresses'] = {
        ContactAddress: {
          address1: customer.defaultAddress.line1,
          address2: customer.defaultAddress.line2,
          city: customer.defaultAddress.city,
          state: customer.defaultAddress.region,
          zip: customer.defaultAddress.postalCode,
          country: customer.defaultAddress.country,
        },
      }
    }
    body['Contact'] = contact
  }
  return body
}
