/**
 * Karbon → canonical Organization transform.
 *
 * Karbon does not expose a single "company settings" endpoint.
 * The closest equivalent is the ClientGroup resource, which groups
 * client contacts/organisations under a common entity with a full
 * BusinessCard (addresses, phones, emails).
 *
 * A ClientGroup is mapped to Organization when used as a top-level entity.
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface KarbonClientGroupAddress {
  AddressKey?: string
  AddressLines?: string
  City?: string
  StateProvinceCounty?: string
  ZipCode?: string
  CountryCode?: string
  Label?: string
}

export interface KarbonClientGroupBusinessCard {
  WebSites?: string[]
  EmailAddresses?: string[]
  Addresses?: KarbonClientGroupAddress[]
}

export interface KarbonClientGroup {
  ClientGroupKey: string
  FullName?: string
  ContactType?: string
  UserDefinedIdentifier?: string
  PrimaryContact?: string
  LastModifiedDateTime?: string
  BusinessCard?: KarbonClientGroupBusinessCard
  [key: string]: unknown
}

export function transformClientGroupOrganization(raw: KarbonClientGroup): Organization {
  const card = raw.BusinessCard
  const primaryAddr = card?.Addresses?.[0]
  const website = card?.WebSites?.find(Boolean) || undefined

  return {
    id: raw.ClientGroupKey,
    name: raw.FullName || undefined,
    legalName: raw.FullName || undefined,
    organizationCode: raw.UserDefinedIdentifier || undefined,
    website,
    address: primaryAddr
      ? toAddress({
          address1: primaryAddr.AddressLines,
          city: primaryAddr.City,
          region: primaryAddr.StateProvinceCounty,
          postalCode: primaryAddr.ZipCode,
          country: primaryAddr.CountryCode,
        })
      : undefined,
    updatedAt: raw.LastModifiedDateTime ? new Date(raw.LastModifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
