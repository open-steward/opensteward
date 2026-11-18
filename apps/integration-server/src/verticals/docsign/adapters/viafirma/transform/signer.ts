import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso, type RawViafirmaLink, type RawViafirmaMessage } from './shared'

/**
 * Viafirma has a single recipient role — every recipient is a signer of the
 * SET. (Carbon-copy / witness distinctions are not modelled by Documents.)
 */
function mapStatus(raw: string | undefined): SignerStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'RESPONSED':
    case 'SIGNED':
    case 'WAITING_CHECK':
      return 'signed'
    case 'REJECTED':
      return 'declined'
    case 'RECEIVED':
    case 'OPENED':
      return 'delivered'
    case 'SENT':
    case 'PENDING':
      return 'sent'
    default:
      return 'created'
  }
}

/**
 * Transform a Viafirma recipient. The identity fields come from the SET
 * `link`; the response state + timestamps come from the matching `message`
 * (looked up by `messageCode`) when available.
 */
export function transformSigner(
  link: RawViafirmaLink,
  envelopeId: string,
  message?: RawViafirmaMessage,
): Signer {
  const externalId = link.messageCode ?? link.key ?? ''
  const status = link.status ?? message?.recipientStatus ?? message?.status
  const signedStatuses = new Set(['RESPONSED', 'SIGNED', 'WAITING_CHECK'])
  const responded = signedStatuses.has((status ?? '').toUpperCase())
  return {
    id: externalId ? `${envelopeId}:${externalId}` : envelopeId,
    externalId,
    envelopeId,
    email: pickStr(link.mail) ?? '',
    name: pickStr(link.name) ?? '',
    role: 'signer',
    status: mapStatus(status),
    routingOrder: typeof link.order === 'number' && link.order >= 1 ? link.order : undefined,
    signedAt: responded ? toIso(message?.responseDate) : undefined,
    platform: 'viafirma',
    metadata: strMap({
      key: link.key,
      messageCode: link.messageCode,
      userCode: link.userCode,
      phone: link.phone,
      rawStatus: status,
    }),
    raw: { link, message },
  }
}
