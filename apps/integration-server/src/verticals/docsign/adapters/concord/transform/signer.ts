/**
 * Concord signature slot -> canonical Signer.
 *
 * GET /organizations/{organizationId}/agreements/{agreementUid}/signature
 * ("Get agreement signature metadata with slots information") answers
 * SignatureMetadataGet, whose `slots` are SignatureInfoSlotGet
 * (https://api.doc.concordnow.com/concord-openapi-bundled.yaml):
 *   id "slot id"; reservation "Who can sign on a signature slot." (type
 *   NONE | NOT_ORGANIZATION | ORGANIZATION | GROUP | EMAIL | USER, with the
 *   matching user / organization / email / group object); signature (date,
 *   type, info "Details on signatory." name/organization/job/email/image/...).
 *
 * A signed slot names its signatory in `signature.info`. An unsigned slot is
 * named by its reservation, read by the documented `reservation.type`.
 * A slot reserved to nobody in particular (NONE, NOT_ORGANIZATION) and not
 * yet signed names no signer: the adapter skips it rather than invent one.
 *
 * The signature image, font and text are refused: they never reach `raw`.
 */
import type { Signer } from '../../../schema/signer'
import { dateTimeToIso, requireStr, strMap } from './shared'

export interface RawConcordSlotReservation {
  type?: string
  user?: { id?: number; name?: string; email?: string; [key: string]: unknown }
  organization?: { id?: number; name?: string }
  email?: { email?: string }
  group?: { id?: number; deleted?: boolean; name?: string }
}

export interface RawConcordSignatureSlot {
  id?: number
  reservation?: RawConcordSlotReservation
  signature?: {
    date?: string
    type?: string
    info?: {
      name?: string
      organization?: string
      job?: string
      email?: string
      image?: string
      font?: string
      signature?: string
      timezone?: string
    }
  }
}

interface Identity {
  name: string
  email?: string
}

function identity(slot: RawConcordSignatureSlot): Identity | undefined {
  const info = slot.signature?.info
  if (slot.signature && info?.name) return { name: info.name, email: info.email || undefined }
  const r = slot.reservation
  switch (r?.type) {
    case 'USER':
      return r.user?.name ? { name: r.user.name, email: r.user.email || undefined } : undefined
    case 'EMAIL':
      return r.email?.email ? { name: r.email.email, email: r.email.email } : undefined
    case 'GROUP':
      return r.group?.name ? { name: r.group.name } : undefined
    case 'ORGANIZATION':
      return r.organization?.name ? { name: r.organization.name } : undefined
    default:
      return undefined
  }
}

/** The slot with the signature image, font and typed signature removed. */
function redact(slot: RawConcordSignatureSlot): RawConcordSignatureSlot {
  if (!slot.signature?.info) return slot
  const { image: _image, font: _font, signature: _text, ...info } = slot.signature.info
  return { ...slot, signature: { ...slot.signature, info } }
}

/** Whether a slot names a signer at all (see the module comment). */
export function slotNamesSigner(slot: RawConcordSignatureSlot): boolean {
  return identity(slot) !== undefined
}

export function transformSigner(raw: RawConcordSignatureSlot, envelopeId: string): Signer {
  if (typeof raw.id !== 'number')
    throw new Error(`concord signature slot on ${envelopeId} has no id`)
  const who = identity(raw)
  if (!who) throw new Error(`concord signature slot ${raw.id} on ${envelopeId} names no signer`)
  const signed = raw.signature !== undefined && raw.signature !== null
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    envelopeId: requireStr(envelopeId, 'signer envelope id'),
    email: who.email,
    name: who.name,
    role: 'signer',
    status: signed ? 'signed' : 'unknown',
    signedAt: signed ? dateTimeToIso(raw.signature?.date) : undefined,
    platform: 'concord',
    metadata: strMap({
      reservationType: raw.reservation?.type,
      signatureType: raw.signature?.type,
      organization: raw.signature?.info?.organization,
      job: raw.signature?.info?.job,
    }),
    raw: redact(raw),
  }
}

/**
 * SignatureMetadataGet, "Agreement signature metadata": `enforceOrder` ("If
 * true, will force signers to respect the signing order."), `autoRequest`,
 * `signatureProvider`, `slots` ("Signature slots details."). The schema lists
 * no required properties.
 */
export interface RawConcordSignatureMetadata {
  enforceOrder?: boolean
  autoRequest?: boolean
  signatureProvider?: string
  slots?: RawConcordSignatureSlot[]
}

/**
 * The slots of a SignatureMetadataGet reply. `slots` is not a required
 * property, so an absent one is an agreement with no slots; any other
 * non-array (or a reply that is not an object) is a malformed reply and throws.
 */
export function signatureSlots(
  meta: RawConcordSignatureMetadata | null | undefined,
  envelopeId: string,
): RawConcordSignatureSlot[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error(`concord SignatureGet on ${envelopeId} did not return an object`)
  }
  if (meta.slots === undefined) return []
  if (!Array.isArray(meta.slots)) {
    throw new Error(`concord SignatureGet slots on ${envelopeId} is not an array`)
  }
  return meta.slots
}
