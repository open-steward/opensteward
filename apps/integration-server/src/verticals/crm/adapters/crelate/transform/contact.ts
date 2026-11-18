/**
 * Crelate v3 contact (`RetrieveContacts`, the `Data` of GET /contacts and
 * GET /contacts/{id}) → canonical Contact.
 *
 * Field names and meanings are the v3 OpenAPI document's
 * (https://app.crelate.com/api3/docs/v3/crelate-openapi.json):
 *   Id          "The globally unique primary key of a record."
 *   FirstName   "The Contact's first name or given name."
 *   LastName    "The Contact's last name, surname, or family name."
 *   Name        "The Contact's full name"
 *   EmailAddresses_* / PhoneNumbers_* — { Value, IsPrimary } ("Whether the
 *               Phone Number is the primary number of a record.")
 *   CurrentPosition "The Contact's current company and job title" —
 *               { JobTitle, CompanyId: Lookup { Id, Title } }
 *   Owners      [{ Id, IsPrimary: "Whether an owning user is the primary owner." }]
 *   Addresses_* { Line1, Line2, City, State, ZipCode, IsPrimary, CountryId: Lookup }
 *   CreatedOn / ModifiedOn — date-time.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/** Lookup: `{ Id, Title }` — "Crelate uses lookups to link records together". */
export interface CrelateLookup {
  Id: string
  Title?: string | null
}

/** Owner: `{ Id, IsPrimary, Title }`. */
export interface CrelateOwner {
  Id: string
  IsPrimary: boolean
  Title?: string | null
}

/** EmailAddressesBase / PhoneNumbersBase share `Value` + `IsPrimary`. */
export interface CrelateValueField {
  Value?: string | null
  IsPrimary?: boolean | null
}

/** AddressesBase. */
export interface CrelateAddress {
  Line1?: string | null
  Line2?: string | null
  City?: string | null
  State?: string | null
  ZipCode?: string | null
  IsPrimary?: boolean | null
  CountryId?: CrelateLookup | null
}

export interface RawCrelateContact {
  Id?: string | null
  FirstName?: string | null
  LastName?: string | null
  Name?: string | null
  EmailAddresses_Work?: CrelateValueField | null
  EmailAddresses_Personal?: CrelateValueField | null
  EmailAddresses_Other?: CrelateValueField | null
  PhoneNumbers_Mobile?: CrelateValueField | null
  PhoneNumbers_Work_Direct?: CrelateValueField | null
  PhoneNumbers_Work_Main?: CrelateValueField | null
  PhoneNumbers_Home?: CrelateValueField | null
  CurrentPosition?: {
    Id?: string
    IsPrimary?: boolean
    JobTitle?: string | null
    CompanyId?: CrelateLookup | null
  } | null
  Addresses_Business?: CrelateAddress | null
  Addresses_Home?: CrelateAddress | null
  Addresses_Other?: CrelateAddress | null
  Owners?: CrelateOwner[] | null
  CreatedOn?: string | null
  ModifiedOn?: string | null
  [key: string]: unknown
}

/** A record's id; v3 marks `Id` nullable, and an id is never invented. */
export function requireId(raw: { Id?: string | null }, what: string): string {
  if (typeof raw.Id !== 'string' || raw.Id === '') {
    throw new Error(`Crelate returned a ${what} without an Id`)
  }
  return raw.Id
}

/** The entry flagged `IsPrimary`, else the first listed field that has a value. */
export function primaryValue(
  fields: Array<CrelateValueField | null | undefined>,
): string | undefined {
  const present = fields.filter((f): f is CrelateValueField => f != null && !!f.Value)
  return (present.find((f) => f.IsPrimary === true) ?? present[0])?.Value ?? undefined
}

/** The address flagged `IsPrimary`, else the first listed address. */
export function primaryAddress(
  addrs: Array<CrelateAddress | null | undefined>,
): CrelateAddress | undefined {
  const present = addrs.filter((a): a is CrelateAddress => a != null)
  return present.find((a) => a.IsPrimary === true) ?? present[0]
}

/**
 * Canonical address. `country` is ISO 3166-1 alpha-2 and Crelate returns a
 * country Lookup (an id and a display title), so it is left out; the raw
 * value stays in `metadata`.
 */
export function toAddress(a: CrelateAddress | undefined): Contact['address'] {
  if (!a) return undefined
  return {
    line1: a.Line1 ?? undefined,
    line2: a.Line2 ?? undefined,
    city: a.City ?? undefined,
    region: a.State ?? undefined,
    postalCode: a.ZipCode ?? undefined,
  }
}

/** The owner flagged `IsPrimary`, else the first owner. */
export function primaryOwnerId(owners: CrelateOwner[] | null | undefined): string | undefined {
  const list = owners ?? []
  return (list.find((o) => o.IsPrimary) ?? list[0])?.Id
}

export function transformContact(raw: RawCrelateContact): Contact {
  return {
    id: requireId(raw, 'contact'),
    first_name: raw.FirstName ?? undefined,
    last_name: raw.LastName ?? undefined,
    name: raw.Name ?? undefined,
    email: primaryValue([
      raw.EmailAddresses_Work,
      raw.EmailAddresses_Personal,
      raw.EmailAddresses_Other,
    ]),
    phone: primaryValue([
      raw.PhoneNumbers_Mobile,
      raw.PhoneNumbers_Work_Direct,
      raw.PhoneNumbers_Work_Main,
      raw.PhoneNumbers_Home,
    ]),
    mobile: raw.PhoneNumbers_Mobile?.Value ?? undefined,
    title: raw.CurrentPosition?.JobTitle ?? undefined,
    company_id: raw.CurrentPosition?.CompanyId?.Id ?? undefined,
    owner_id: primaryOwnerId(raw.Owners),
    address: toAddress(
      primaryAddress([raw.Addresses_Business, raw.Addresses_Home, raw.Addresses_Other]),
    ),
    created_at: toIsoDatetime(raw.CreatedOn),
    updated_at: toIsoDatetime(raw.ModifiedOn),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical → retired-v1 contact body. Used only by the out-of-scope write
 * methods, which still target v1; kept as it was.
 */
export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.work_email = { address: data.email }
  if (data.phone !== undefined) out.mobile_phone = { number: data.phone }
  if (data.title !== undefined) out.current_position_title = data.title
  if (data.company_id !== undefined) out.current_position_company_id = data.company_id
  return out
}
