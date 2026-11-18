/**
 * Transform an Unthread customer object into the canonical Contact schema.
 *
 * Unthread "customers" represent organisations/accounts rather than individual
 * end-users. We map what PII fields are available (name) and surface the
 * primary email domains as metadata only — no individual email is stored on
 * the customer object itself.
 *
 * The id from Unthread is a UUID string; slackChannelId and projectId are
 * surfaced in metadata.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUnthreadCustomer {
  id: string
  name?: string | null
  /** Array of email domains associated with this customer */
  emailDomains?: string[] | null
  slackChannelId?: string | null
  projectId?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawUnthreadCustomer): Contact {
  return {
    id: raw.id,
    externalId: raw.id,
    email: undefined,
    name: pickStr(raw.name) ?? '',
    phone: undefined,
    organizationId: pickStr(raw.projectId),
    platform: 'unthread',
    metadata: strMap({
      slackChannelId: raw.slackChannelId,
      emailDomains: Array.isArray(raw.emailDomains) ? raw.emailDomains.join(',') : undefined,
    }),
    raw,
  }
}
