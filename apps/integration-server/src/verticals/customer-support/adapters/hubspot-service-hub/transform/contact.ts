/**
 * HubSpot Service Hub contact transform.
 *
 * Contacts come from GET /crm/v3/objects/contacts
 * All contact data lives inside `properties`.
 *
 * Key default properties requested:
 *   email, firstname, lastname, phone, associatedcompanyid,
 *   createdate, lastmodifieddate
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHubspotContactProperties {
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  phone?: string | null
  associatedcompanyid?: string | null
  createdate?: string | null
  lastmodifieddate?: string | null
  [key: string]: unknown
}

export interface RawHubspotContact {
  id: string
  properties: RawHubspotContactProperties
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  [key: string]: unknown
}

function buildName(props: RawHubspotContactProperties): string {
  const first = pickStr(props.firstname) ?? ''
  const last = pickStr(props.lastname) ?? ''
  return [first, last].filter(Boolean).join(' ')
}

export function transformContact(raw: RawHubspotContact): Contact {
  const props = raw.properties ?? {}
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(props.email),
    name: buildName(props),
    phone: pickStr(props.phone),
    organizationId: pickStr(props.associatedcompanyid),
    platform: 'hubspot-service-hub',
    metadata: strMap({
      createdAt: toIso(props.createdate ?? raw.createdAt),
      updatedAt: toIso(props.lastmodifieddate ?? raw.updatedAt),
    }),
    raw,
  }
}
