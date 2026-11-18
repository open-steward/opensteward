/**
 * Contact → Contact. Only name, email, phone and account are read (the
 * vertical's PII-minimal contact).
 * https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_contact.htm
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export const CONTACT_FIELDS = [
  'Id',
  'Name',
  'Email',
  'Phone',
  'AccountId',
  'CreatedDate',
  'LastModifiedDate',
] as const

export interface RawSalesforceContact {
  attributes?: { type?: string; url?: string }
  Id: string
  Name?: string | null
  Email?: string | null
  Phone?: string | null
  AccountId?: string | null
  CreatedDate?: string | null
  LastModifiedDate?: string | null
}

export function transformContact(raw: RawSalesforceContact): Contact {
  return {
    id: raw.Id,
    externalId: raw.Id,
    email: pickStr(raw.Email),
    name: pickStr(raw.Name) ?? '',
    phone: pickStr(raw.Phone),
    organizationId: pickStr(raw.AccountId),
    platform: 'salesforce-service',
    metadata: strMap({ lastModifiedDate: raw.LastModifiedDate }),
    raw,
  }
}
