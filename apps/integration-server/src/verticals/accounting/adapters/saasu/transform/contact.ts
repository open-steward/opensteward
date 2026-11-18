/**
 * Saasu Contact → canonical Contact.
 *
 * The `Contact` model of GET Contacts / GET Contact/{id}
 * (https://api.saasu.com/Help/Api/GET-Contacts,
 * https://api.saasu.com/Help/Api/GET-Contact-id-optionalargs, fetched
 * 2026-09-29):
 *
 *   Id ("Contact's Id in Saasu system") → id
 *   GivenName / FamilyName → firstName / lastName, and the display name
 *   ContactId ("used as an Account or Contact reference") → identification
 *   IsActive / IsCustomer / IsSupplier → isActive / isCustomer / isSupplier
 *   EmailAddress → emails (WORK)
 *   PrimaryPhone → WORK, MobilePhone → MOBILE, HomePhone → HOME,
 *   Fax → FAX, OtherPhone → OTHER
 *   PostalAddress ("The postal or mailing address") → billingAddress
 *   OtherAddress ("E.g. "Shipping Address"") → shippingAddress
 *   CreatedDateUtc / LastModifiedDateUtc → createdAt / updatedAt
 *
 * An `Address` is Street, City, State, Postcode, Country ("The country")
 * (https://api.saasu.com/Help/ResourceModel?modelName=Address); the samples
 * send the country by name ("Australia"), which is normalised to ISO 3166-1
 * alpha-2 and left out when it cannot be.
 *
 * A contact carries only `CompanyId`, not the company's name, so no
 * `companyName` is reported (reading it would cost one GET Company per row).
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty, composeName, toUtcDate } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface SaasuAddress {
  Street?: string | null
  City?: string | null
  State?: string | null
  Postcode?: string | null
  Country?: string | null
}

export interface SaasuContact {
  Id: number
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  GivenName?: string | null
  FamilyName?: string | null
  IsActive?: boolean | null
  CompanyId?: number | null
  PrimaryPhone?: string | null
  HomePhone?: string | null
  OtherPhone?: string | null
  MobilePhone?: string | null
  Fax?: string | null
  EmailAddress?: string | null
  ContactId?: string | null
  IsCustomer?: boolean | null
  IsSupplier?: boolean | null
  PostalAddress?: SaasuAddress | null
  OtherAddress?: SaasuAddress | null
  [key: string]: unknown
}

function address(raw: SaasuAddress | null | undefined) {
  if (!raw) return undefined
  return toAddress({
    address1: raw.Street,
    city: raw.City,
    region: raw.State,
    postalCode: raw.Postcode,
    country: toIso3166Alpha2(raw.Country),
  })
}

function bool(v: boolean | null | undefined): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

export function transformContact(raw: SaasuContact): Contact {
  const telephones: Telephone[] = []
  if (raw.PrimaryPhone) telephones.push({ telephone: raw.PrimaryPhone, type: 'WORK' })
  if (raw.MobilePhone) telephones.push({ telephone: raw.MobilePhone, type: 'MOBILE' })
  if (raw.HomePhone) telephones.push({ telephone: raw.HomePhone, type: 'HOME' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })
  if (raw.OtherPhone) telephones.push({ telephone: raw.OtherPhone, type: 'OTHER' })

  return {
    id: String(raw.Id),
    name: composeName(undefined, raw.GivenName, raw.FamilyName),
    firstName: raw.GivenName || undefined,
    lastName: raw.FamilyName || undefined,
    identification: raw.ContactId || undefined,
    isCustomer: bool(raw.IsCustomer),
    isSupplier: bool(raw.IsSupplier),
    isActive: bool(raw.IsActive),
    emails: nonempty(toWorkEmail(raw.EmailAddress)),
    telephones: nonempty(telephones),
    billingAddress: address(raw.PostalAddress),
    shippingAddress: address(raw.OtherAddress),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
