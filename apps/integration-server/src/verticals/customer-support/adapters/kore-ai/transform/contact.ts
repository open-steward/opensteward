/**
 * Transform a Kore.ai SmartAssist contact into the canonical Contact.
 *
 * API endpoint: GET /agentassist/api/v1/public/{streamId}/contacts
 * Response envelope: { results: RawKoreAiContact[], skip, limit, hasMore, … }
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKoreAiContact {
  /** Mongo ID */
  id?: string
  _id?: string
  firstName?: string
  lastName?: string
  fullName?: string
  salutation?: string
  emailId?: string
  /** Structured phone object */
  cellPhone?: { extension?: string; phoneNumber?: string; countryCode?: string }
  status?: string
  orgId?: string
  accountId?: string
  instanceBotId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawKoreAiContact): Contact {
  const id = pickStr(raw.id ?? raw._id) ?? ''
  const fullName =
    pickStr(raw.fullName) ??
    [raw.salutation, raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ??
    ''
  const phone = raw.cellPhone?.phoneNumber
    ? [raw.cellPhone.countryCode, raw.cellPhone.phoneNumber]
        .filter(Boolean)
        .join('')
    : undefined

  return {
    id,
    externalId: id,
    email: pickStr(raw.emailId),
    name: fullName,
    phone: phone ? pickStr(phone) : undefined,
    organizationId: pickStr(raw.orgId),
    platform: 'kore-ai',
    metadata: strMap({
      status: raw.status,
      accountId: raw.accountId,
      instanceBotId: raw.instanceBotId,
    }),
    raw,
  }
}
