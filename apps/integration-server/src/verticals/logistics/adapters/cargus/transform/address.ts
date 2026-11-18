import type { Address } from '../../../schema/shared'

/**
 * The Sender / Recipient object of an AWB, as the first-party developer
 * portal documents it for `Awbs_GetByDate` and `Awbs_Get`
 * (https://urgentcargus.developer.azure-api.net/api-details#api=55acb9ae5f80b911a8f59a5f&operation=Awbs_GetByDate):
 *
 *   "Sender":{"LocationId":0,"Name":"string","CountyId":0,"CountyName":"string",
 *   "LocalityId":0,"LocalityName":"string","StreetId":0,"StreetName":"string",
 *   "BuildingNumber":"string","AddressText":"string","ContactPerson":"string",
 *   "PhoneNumber":"string","Email":"string","CodPostal":"string",
 *   "PostalCode":"string","CountryId":0}
 *
 * `CountryId` is a Cargus nomenclature number, not an ISO 3166 code, so no
 * country is mapped.
 */
export interface CargusAwbAddress {
  LocationId?: number | null
  Name?: string | null
  CountyId?: number | null
  CountyName?: string | null
  LocalityId?: number | null
  LocalityName?: string | null
  StreetId?: number | null
  StreetName?: string | null
  BuildingNumber?: string | null
  AddressText?: string | null
  ContactPerson?: string | null
  PhoneNumber?: string | null
  Email?: string | null
  CodPostal?: string | null
  PostalCode?: string | null
  CountryId?: number | null
}

function text(v: string | null | undefined): string | undefined {
  return v == null || v === '' ? undefined : v
}

export function transformAddress(raw: CargusAwbAddress): Address {
  const street = [text(raw.StreetName), text(raw.BuildingNumber)].filter(Boolean).join(' ')
  return {
    name: text(raw.ContactPerson),
    company: text(raw.Name),
    street1: street || undefined,
    street2: text(raw.AddressText),
    city: text(raw.LocalityName),
    state: text(raw.CountyName),
    postalCode: text(raw.CodPostal),
    phone: text(raw.PhoneNumber),
    email: text(raw.Email),
  }
}
