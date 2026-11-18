/**
 * Transform a Jira Service Management UserDTO (customer) to canonical Contact.
 *
 * Customers are fetched from:
 *   GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/customer
 *
 * JSM UserDTO fields:
 *   accountId    — Atlassian account ID (primary key)
 *   displayName  — full display name
 *   emailAddress — email address
 *   active       — boolean account status
 *   timeZone     — optional timezone string
 *
 * Docs: https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-servicedesk/
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJsmCustomer {
  accountId?: string
  name?: string            // legacy; accountId is canonical
  displayName?: string
  emailAddress?: string
  active?: boolean
  timeZone?: string
  [key: string]: unknown
}

export function transformContact(raw: RawJsmCustomer): Contact {
  return {
    id: pickStr(raw.accountId) ?? pickStr(raw.name) ?? '',
    externalId: pickStr(raw.accountId) ?? pickStr(raw.name) ?? '',
    email: pickStr(raw.emailAddress),
    name: pickStr(raw.displayName) ?? pickStr(raw.name) ?? '',
    phone: undefined, // JSM UserDTO does not include phone
    organizationId: undefined, // Organization membership fetched separately
    platform: 'jira-service-management',
    metadata: strMap({
      active: raw.active,
      timeZone: raw.timeZone,
    }),
    raw,
  }
}
