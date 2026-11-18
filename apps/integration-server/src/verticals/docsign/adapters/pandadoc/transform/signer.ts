import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

export interface RawPandaDocRecipient {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  recipient_type?: string
  has_completed?: boolean
  signing_order?: number
  shared_link?: string
  [key: string]: unknown
}

function mapRole(t: string | undefined): SignerRole {
  switch (t) {
    case 'cc':
      return 'cc'
    case 'approver':
      return 'approver'
    case 'editor':
      return 'editor'
    case 'signer':
      return 'signer'
    default:
      return 'signer'
  }
}

function mapStatus(hasCompleted: boolean | undefined): SignerStatus {
  return hasCompleted ? 'signed' : 'sent'
}

export function transformSigner(
  raw: RawPandaDocRecipient,
  envelopeId: string,
): Signer {
  return {
    id: raw.id ?? `${envelopeId}:${raw.email ?? ''}`,
    externalId: raw.id ?? raw.email ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(
      [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    ) ?? '',
    role: mapRole(raw.recipient_type),
    status: mapStatus(raw.has_completed),
    routingOrder: raw.signing_order ?? undefined,
    platform: 'pandadoc',
    metadata: strMap({ sharedLink: raw.shared_link, recipientType: raw.recipient_type }),
    raw,
  }
}
