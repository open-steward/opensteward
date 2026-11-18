/**
 * Karbon contact transform.
 *
 * Karbon exposes two contact-like resources:
 *  - Contact  (individual person — ContactKey)
 *  - Organization (company — OrganizationKey)
 *
 * Both are mapped to the canonical Contact type.
 * The BusinessCard sub-resource carries address/phone/email details.
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Karbon raw types ──────────────────────────────────────────────────────────

export interface KarbonAddress {
  AddressKey?: string
  AddressLines?: string
  City?: string
  StateProvinceCounty?: string
  ZipCode?: string
  CountryCode?: string
  Label?: string
}

export interface KarbonPhoneNumber {
  PhoneNumberKey?: string
  Number?: string
  CountryCode?: string
  Label?: string
}

export interface KarbonBusinessCard {
  BusinessCardKey?: string
  EntityType?: string
  EntityKey?: string
  IsPrimaryCard?: boolean
  WebSites?: string[]
  EmailAddresses?: string[]
  OrganizationKey?: string
  RoleOrTitle?: string
  Addresses?: KarbonAddress[]
  PhoneNumbers?: KarbonPhoneNumber[]
}

export interface KarbonContact {
  ContactKey: string
  FullName?: string
  EmailAddress?: string
  PhoneNumber?: string
  MobilePhoneNumber?: string
  FaxNumber?: string
  AddressLine?: string
  City?: string
  StateProvinceCounty?: string
  ZipCode?: string
  Country?: string
  ContactType?: string
  UserDefinedIdentifier?: string
  RestrictionLevel?: string
  LastModifiedDateTime?: string
  BusinessCard?: KarbonBusinessCard
  [key: string]: unknown
}

export interface KarbonOrganization {
  OrganizationKey: string
  FullName?: string
  LegalName?: string
  EmailAddress?: string
  PhoneNumber?: string
  AddressLine?: string
  City?: string
  StateProvinceCounty?: string
  ZipCode?: string
  Country?: string
  ContactType?: string
  UserDefinedIdentifier?: string
  PrimaryContact?: string
  LastModifiedDateTime?: string
  BusinessCard?: KarbonBusinessCard
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapPhoneLabel(label?: string): Telephone['type'] {
  switch ((label ?? '').toLowerCase()) {
    case 'mobile': return 'MOBILE'
    case 'home': return 'HOME'
    case 'other': return 'OTHER'
    default: return 'WORK'
  }
}

function telephonesFromCard(card?: KarbonBusinessCard): Telephone[] {
  if (!card?.PhoneNumbers) return []
  return card.PhoneNumbers.filter((p) => p.Number).map((p) => ({
    telephone: p.Number!,
    type: mapPhoneLabel(p.Label),
  }))
}

function emailsFromCard(card?: KarbonBusinessCard) {
  if (!card?.EmailAddresses?.length) return []
  return card.EmailAddresses.filter(Boolean).map((e) => ({ email: e, type: 'WORK' as const }))
}

function addressFromCard(card?: KarbonBusinessCard) {
  const addr = card?.Addresses?.[0]
  if (!addr) return undefined
  return toAddress({
    address1: addr.AddressLines,
    city: addr.City,
    region: addr.StateProvinceCounty,
    postalCode: addr.ZipCode,
    country: addr.CountryCode,
  })
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformContact(raw: KarbonContact): Contact {
  const card = raw.BusinessCard
  const emails = emailsFromCard(card).length
    ? emailsFromCard(card)
    : toWorkEmail(raw.EmailAddress)
  const telephones = nonempty(
    telephonesFromCard(card).length
      ? telephonesFromCard(card)
      : ([
          raw.PhoneNumber ? { telephone: raw.PhoneNumber, type: 'WORK' as const } : undefined,
          raw.MobilePhoneNumber ? { telephone: raw.MobilePhoneNumber, type: 'MOBILE' as const } : undefined,
          raw.FaxNumber ? { telephone: raw.FaxNumber, type: 'FAX' as const } : undefined,
        ].filter(Boolean) as Telephone[])
  )

  return {
    id: raw.ContactKey,
    name: raw.FullName || undefined,
    identification: raw.UserDefinedIdentifier || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones,
    billingAddress: addressFromCard(card) ?? toAddress({
      address1: raw.AddressLine,
      city: raw.City,
      region: raw.StateProvinceCounty,
      postalCode: raw.ZipCode,
      country: raw.Country,
    }),
    updatedAt: raw.LastModifiedDateTime ? new Date(raw.LastModifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrganization(raw: KarbonOrganization): Contact {
  const card = raw.BusinessCard
  const emails = emailsFromCard(card).length
    ? emailsFromCard(card)
    : toWorkEmail(raw.EmailAddress)
  const telephones = nonempty(
    telephonesFromCard(card).length
      ? telephonesFromCard(card)
      : (raw.PhoneNumber ? [{ telephone: raw.PhoneNumber, type: 'WORK' as const }] : [])
  )

  return {
    id: raw.OrganizationKey,
    name: raw.FullName || undefined,
    companyName: raw.FullName || undefined,
    identification: raw.UserDefinedIdentifier || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: nonempty(emails),
    telephones,
    billingAddress: addressFromCard(card) ?? toAddress({
      address1: raw.AddressLine,
      city: raw.City,
      region: raw.StateProvinceCounty,
      postalCode: raw.ZipCode,
      country: raw.Country,
    }),
    updatedAt: raw.LastModifiedDateTime ? new Date(raw.LastModifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
