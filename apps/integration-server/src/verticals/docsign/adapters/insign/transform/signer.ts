import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * inSign signer — an external participant invited to a session. The signing
 * roster lives in `externUsers[]` (each carries the recipient's email in
 * `externUser`); per-field signing progress lives in `signaturFieldsStatusList`
 * keyed by `role`. We build one canonical `Signer` per external user and fold
 * in the matching signature-field state (signed flag + signTimestamp) when the
 * field's `externRole`/`role` resolves to that user's order or address.
 *
 * Handwritten/biometric `signatureBitmap` data on the field is never read.
 */
export interface RawInsignExternUser {
  externUser?: string
  orderNumber?: number
  rejected?: boolean
  signedAny?: boolean
  dsgvoDeclined?: boolean
  userType?: string
  message?: string
  token?: string
  [key: string]: unknown
}

export interface RawInsignSignatureField {
  fieldID?: string
  role?: string
  externRole?: string | null
  displayname?: string
  documentID?: string
  signed?: boolean
  mandatory?: boolean
  signTimestamp?: number | string | null
  [key: string]: unknown
}

function mapStatus(
  field: RawInsignSignatureField | undefined,
  user: RawInsignExternUser,
): SignerStatus {
  if (user.rejected || user.dsgvoDeclined) return 'declined'
  if (field?.signed || user.signedAny) return 'signed'
  return 'sent'
}

/**
 * Pick the signature field that belongs to a given external user. inSign keys
 * fields by signing order (Signer1, Signer2, …) and by `externRole`, so we
 * match on the 1-indexed order suffix or an explicit role match.
 */
function fieldForUser(
  fields: RawInsignSignatureField[],
  user: RawInsignExternUser,
  index: number,
): RawInsignSignatureField | undefined {
  const order = typeof user.orderNumber === 'number' ? user.orderNumber : index
  const wantRole = `signer${order + 1}`.toLowerCase()
  return (
    fields.find(
      (f) => (f.externRole ?? '').toLowerCase() === (user.externUser ?? '').toLowerCase(),
    ) ??
    fields.find((f) => (f.role ?? '').toLowerCase() === wantRole) ??
    fields[index]
  )
}

export function transformSigner(
  user: RawInsignExternUser,
  fields: RawInsignSignatureField[],
  sessionId: string,
  index: number,
): Signer {
  const email = pickStr(user.externUser) || undefined
  const field = fieldForUser(fields, user, index)
  const id = `${sessionId}:${email ?? index}`
  return {
    id,
    externalId: email ?? String(index),
    envelopeId: sessionId,
    email,
    name: pickStr(field?.displayname) ?? email ?? '',
    role: 'signer',
    status: mapStatus(field, user),
    routingOrder:
      typeof user.orderNumber === 'number' && user.orderNumber > 0 ? user.orderNumber : undefined,
    signedAt: field?.signed ? toIso(field.signTimestamp) : undefined,
    declineReason: user.rejected ? pickStr(user.message) : undefined,
    platform: 'insign',
    metadata: strMap({
      userType: user.userType,
      signatureRole: field?.role,
      mandatory: field?.mandatory,
    }),
    raw: { externUser: user, signatureField: field },
  }
}
