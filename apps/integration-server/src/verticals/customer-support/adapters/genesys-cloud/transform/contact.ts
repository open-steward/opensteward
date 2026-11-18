/**
 * Transform a Genesys Cloud external contact to the canonical Contact schema.
 *
 * Genesys Cloud stores non-agent external contacts via the External Contacts API:
 *   GET /api/v2/externalcontacts/contacts
 *
 * Fields: id, firstName, lastName, middleName, title, companyName,
 *   phoneNumbers (array), emailAddresses (array), externalOrganization.id,
 *   surveyOptOut, externalSystemUrl, createDate, modifyDate, selfUri.
 *
 * Docs: https://developer.genesys.cloud/useragentman/externalcontacts/
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGenesysContactPhone {
  display?: string
  columnType?: string
  [key: string]: unknown
}

export interface RawGenesysContactEmail {
  address?: string
  [key: string]: unknown
}

export interface RawGenesysExternalContact {
  id?: string
  firstName?: string
  lastName?: string
  middleName?: string
  title?: string
  companyName?: string
  phoneNumbers?: RawGenesysContactPhone[]
  emailAddresses?: RawGenesysContactEmail[]
  externalOrganization?: { id?: string; name?: string } | null
  createDate?: string
  modifyDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawGenesysExternalContact): Contact {
  const id = pickStr(raw.id) ?? ''
  const nameParts = [raw.firstName, raw.middleName, raw.lastName].filter(Boolean)
  const name = nameParts.length > 0 ? nameParts.join(' ') : pickStr(raw.companyName) ?? ''
  const email = raw.emailAddresses?.[0]?.address
  const phone = raw.phoneNumbers?.[0]?.display

  return {
    id,
    externalId: id,
    email: pickStr(email),
    name,
    phone: pickStr(phone),
    organizationId: raw.externalOrganization?.id
      ? String(raw.externalOrganization.id)
      : undefined,
    platform: 'genesys-cloud',
    metadata: strMap({
      title: raw.title,
      companyName: raw.companyName,
      createDate: toIso(raw.createDate),
      modifyDate: toIso(raw.modifyDate),
    }),
    raw,
  }
}
