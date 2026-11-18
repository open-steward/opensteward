/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

export interface SapB1BpAddress {
  AddressName: string
  Street: string
  City: string
  ZipCode: string
  Country: string
}

export interface SapB1BusinessPartner {
  CardCode: string
  CardName: string
  CardType: 'cCustomer' | 'cSupplier' | 'cLead'
  EmailAddress: string
  Phone1: string
  Fax: string
  Currency: string
  Active: 'tYES' | 'tNO'
  BillingAddress?: SapB1BpAddress
  ShippingAddress?: SapB1BpAddress
  [key: string]: unknown
}

export function transformContact(raw: SapB1BusinessPartner): Contact {
  const emails: Email[] = raw.EmailAddress ? [{ email: raw.EmailAddress, type: 'WORK' }] : []
  const telephones: Telephone[] = []
  if (raw.Phone1) telephones.push({ telephone: raw.Phone1, type: 'WORK' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })

  const billingAddress: Address | undefined = raw.BillingAddress
    ? {
        address1: raw.BillingAddress.Street || undefined,
        city: raw.BillingAddress.City || undefined,
        postalCode: raw.BillingAddress.ZipCode || undefined,
        country: raw.BillingAddress.Country || undefined,
      }
    : undefined

  const shippingAddress: Address | undefined = raw.ShippingAddress
    ? {
        address1: raw.ShippingAddress.Street || undefined,
        city: raw.ShippingAddress.City || undefined,
        postalCode: raw.ShippingAddress.ZipCode || undefined,
        country: raw.ShippingAddress.Country || undefined,
      }
    : undefined

  return {
    id: raw.CardCode,
    name: raw.CardName || undefined,
    isCustomer: raw.CardType === 'cCustomer',
    isSupplier: raw.CardType === 'cSupplier',
    isActive: raw.Active === 'tYES',
    currency: raw.Currency || undefined,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress,
    shippingAddress,
    metadata: raw as Record<string, unknown>,
  }
}
