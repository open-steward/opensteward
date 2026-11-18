/**
 * `GET /v6/envelope/{envelopeId}` (`EnvelopeGetResponse`) plus
 * `GET /v6/envelope/{envelopeId}/files` (`EnvelopeGetFilesResponse`) →
 * canonical Envelope.
 *
 * The overview has no document list, so the document ids come from the
 * files call. Signing order: "In order to config a parallel use case all
 * recipients (who should sign parallel) must be assigned to the same
 * "SigningGroup"" (Parallel Signing Scenario,
 * https://namirial.atlassian.net/wiki/pages/viewpage.action?pageId=91882363),
 * so an envelope whose Sign activities span more than one SigningGroup is
 * sequential. SignAsP7M activities carry their own SignAsP7MGroup ("The
 * parallel group for P7M actions."), judged the same way. An envelope with a
 * single group of each kind, or no signing activity, is parallel.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawNamirialEnvelope, RawNamirialEnvelopeFiles } from '../types'
import { pickStr, strMap, toIso } from './shared'
import { recipientActivities, signerId } from './signer'
import { documentId } from './document'

/** `EnvelopeStatus` enum: Active, Completed, Canceled, Expired, Rejected. */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'Active':
      return 'sent'
    case 'Completed':
      return 'completed'
    case 'Canceled':
      return 'voided'
    case 'Expired':
      return 'expired'
    case 'Rejected':
      return 'declined'
    default:
      return 'unknown'
  }
}

export function transformEnvelope(
  raw: RawNamirialEnvelope,
  files: RawNamirialEnvelopeFiles,
): Envelope {
  const envelopeId = pickStr(raw.Id)
  if (!envelopeId) throw new Error('Namirial envelope has no Id')
  const subject = pickStr(raw.Name)
  if (!subject) throw new Error(`Namirial envelope ${envelopeId} has no Name`)
  const recipients = recipientActivities(raw.Activities)
  const activities = raw.Activities ?? []
  // Sign and SignAsP7M each carry their own parallel group ("The parallel
  // group for sign actions." / "The parallel group for P7M actions."). The
  // docs do not say whether the two numberings are one sequence, so each
  // kind is judged on its own.
  const signGroups = new Set(
    activities.filter((a) => a.Action?.Sign).map((a) => a.Action!.Sign!.SigningGroup),
  )
  const p7mGroups = new Set(
    activities.filter((a) => a.Action?.SignAsP7M).map((a) => a.Action!.SignAsP7M!.SignAsP7MGroup),
  )
  const sequential = signGroups.size > 1 || p7mGroups.size > 1
  const sender = raw.SenderUserInformation
  const senderName = [pickStr(sender?.GivenName), pickStr(sender?.Surname)]
    .filter(Boolean)
    .join(' ')
  return {
    id: envelopeId,
    externalId: envelopeId,
    status: mapStatus(raw.EnvelopeStatus),
    subject,
    senderEmail: pickStr(sender?.Email),
    senderName: senderName || undefined,
    signingOrder: sequential ? 'sequential' : 'parallel',
    signerIds: recipients.map((a) => signerId(envelopeId, a)),
    documentIds: (files.Documents ?? []).map((d) => documentId(envelopeId, d)),
    sentAt: toIso(raw.SentDate),
    platform: 'namirial',
    metadata: strMap({ envelopeBulkParentId: raw.EnvelopeBulkParentId }),
    raw: { envelope: raw, files },
  }
}
