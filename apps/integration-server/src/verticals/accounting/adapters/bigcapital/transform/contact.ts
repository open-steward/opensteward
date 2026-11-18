import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName } from '../../shared/transform'

export interface BigcapitalCustomer {
  id: number
  displayName?: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  workPhone?: string
  personalPhone?: string
  currencyCode?: string
  active?: boolean
  billingAddress1?: string
  billingAddress2?: string
  billingAddressCity?: string
  billingAddressState?: string
  billingAddressCountry?: string
  billingAddressPostcode?: string
  shippingAddress1?: string
  shippingAddress2?: string
  shippingAddressCity?: string
  shippingAddressState?: string
  shippingAddressCountry?: string
  shippingAddressPostcode?: string
  balance?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface BigcapitalVendor {
  id: number
  displayName?: string
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  workPhone?: string
  personalPhone?: string
  currencyCode?: string
  active?: boolean
  billingAddress1?: string
  billingAddress2?: string
  billingAddressCity?: string
  billingAddressState?: string
  billingAddressCountry?: string
  billingAddressPostcode?: string
  balance?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCustomer(raw: BigcapitalCustomer): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.workPhone) telephones.push({ telephone: raw.workPhone, type: 'WORK' })
  if (raw.personalPhone) telephones.push({ telephone: raw.personalPhone, type: 'HOME' })

  return {
    id: `cust_${raw.id}`,
    name: composeName(raw.companyName, raw.firstName, raw.lastName) ?? raw.displayName ?? undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.active ?? true,
    currency: raw.currencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.billingAddress1,
      address2: raw.billingAddress2,
      city: raw.billingAddressCity,
      region: raw.billingAddressState,
      postalCode: raw.billingAddressPostcode,
      country: raw.billingAddressCountry,
    }),
    shippingAddress: toAddress({
      address1: raw.shippingAddress1,
      address2: raw.shippingAddress2,
      city: raw.shippingAddressCity,
      region: raw.shippingAddressState,
      postalCode: raw.shippingAddressPostcode,
      country: raw.shippingAddressCountry,
    }),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformVendor(raw: BigcapitalVendor): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.workPhone) telephones.push({ telephone: raw.workPhone, type: 'WORK' })
  if (raw.personalPhone) telephones.push({ telephone: raw.personalPhone, type: 'HOME' })

  return {
    id: `vend_${raw.id}`,
    name: composeName(raw.companyName, raw.firstName, raw.lastName) ?? raw.displayName ?? undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    companyName: raw.companyName || undefined,
    isCustomer: false,
    isSupplier: true,
    isActive: raw.active ?? true,
    currency: raw.currencyCode || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.billingAddress1,
      address2: raw.billingAddress2,
      city: raw.billingAddressCity,
      region: raw.billingAddressState,
      postalCode: raw.billingAddressPostcode,
      country: raw.billingAddressCountry,
    }),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
