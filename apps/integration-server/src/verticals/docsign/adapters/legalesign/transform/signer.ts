import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { idFromUri, pickStr, strMap } from './shared'

/**
 * A Legalesign signer. The document-detail `signer_objects` array uses
 * `firstname`/`lastname`; the `/signer/{id}/` resource uses
 * `first_name`/`last_name`. We accept both. `status` is an integer
 * (SignerStatusEnum) and `role` is one of signer|approver|witness.
 */
export interface RawLegalesignSigner {
  uuid?: string
  resource_uri?: string
  document?: string
  email?: string
  firstname?: string
  lastname?: string
  first_name?: string
  last_name?: string
  tel?: string
  order?: number
  role?: string
  status?: number
  has_fields?: boolean
  [key: string]: unknown
}

/** SignerRoleEnum → canonical role. */
function mapRole(role: string | undefined): SignerRole {
  switch ((role ?? '').toLowerCase()) {
    case 'approver':
      return 'approver'
    case 'witness':
      return 'witness'
    case 'signer':
    default:
      return 'signer'
  }
}

/**
 * SignerStatusEnum → canonical status:
 *   4 unsent, 5 scheduled, 10 sent, 15 email opened, 20 visited,
 *   30 fields complete, 35 fields complete ex signature,
 *   39 waiting for witness, 40 signed, 50 downloaded, 60 rejected.
 */
function mapStatus(status: number | undefined): SignerStatus {
  switch (Number(status)) {
    case 40:
    case 50:
      return 'signed'
    case 60:
      return 'declined'
    case 15:
    case 20:
    case 30:
    case 35:
    case 39:
      return 'delivered'
    case 10:
    case 5:
      return 'sent'
    case 4:
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawLegalesignSigner, envelopeId: string, index: number): Signer {
  const id = raw.uuid ?? idFromUri(raw.resource_uri) ?? `${envelopeId}:${index}`
  const firstName = pickStr(raw.firstname) ?? pickStr(raw.first_name)
  const lastName = pickStr(raw.lastname) ?? pickStr(raw.last_name)
  const name = [firstName, lastName].filter(Boolean).join(' ')
  // Legalesign `order` is 0-indexed; canonical routingOrder is 1-indexed.
  const order = raw.order != null ? Number(raw.order) + 1 : undefined
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name,
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder: order != null && Number.isFinite(order) ? order : undefined,
    platform: 'legalesign',
    metadata: strMap({
      statusCode: raw.status,
      role: raw.role,
      hasFields: raw.has_fields,
      tel: raw.tel,
    }),
    raw,
  }
}
