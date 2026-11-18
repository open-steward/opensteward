import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/** A signer entry on the envelope detail (`signerInfos[]`). */
export interface RawEsignglobalSigner {
  businessId?: string
  userName?: string
  userEmail?: string
  phoneNumber?: { countryCode?: string; number?: string }
  signOrder?: number | string
  digitalSignature?: boolean
  /** 0-Pending, 1-Signing, 2-Signed. */
  signerStatus?: number
  signDate?: number | string | null
  rejectedReason?: string | null
  accessCode?: string | null
  [key: string]: unknown
}

/** A document reference on the envelope detail (`signFiles[]` / `attachments[]`). */
export interface RawEsignglobalFile {
  fileKey?: string
  fileName?: string
  [key: string]: unknown
}

/** GET /esignglobal/v1/envelope/envelopeDetail → `data`. */
export interface RawEsignglobalEnvelope {
  envelopeId: string
  /** 0-Created(Draft), 1-Signing, 2-Completed, 3-Expired, 4-Rejected, 5-Revoked. */
  envelopeStatus?: number
  envelopeCreateTime?: number | string | null
  envelopeEndTime?: number | string | null
  envelopeExpireTime?: number | string | null
  expireTime?: number | string | null
  subject?: string
  remark?: string
  redirectUrl?: string
  CCInfos?: Array<{ userEmail?: string; userName?: string }> | null
  initiatorInfo?: { userName?: string } | null
  signFiles?: RawEsignglobalFile[]
  attachments?: RawEsignglobalFile[]
  signerInfos?: RawEsignglobalSigner[]
  canceledReason?: string | null
  [key: string]: unknown
}

function mapStatus(status: number | undefined): EnvelopeStatus {
  switch (status) {
    case 0:
      return 'draft'
    case 1:
      return 'sent'
    case 2:
      return 'completed'
    case 3:
      return 'expired'
    case 4:
      return 'declined'
    case 5:
      return 'voided'
    default:
      return 'draft'
  }
}

/** Stable per-envelope signer id: `<envelopeId>:<signOrder>:<userEmail>`. */
export function signerExternalId(envelopeId: string, signer: RawEsignglobalSigner): string {
  const order = signer.signOrder != null ? String(signer.signOrder) : '0'
  const who = signer.businessId || signer.userEmail || signer.userName || 'signer'
  return `${envelopeId}:${order}:${who}`
}

/** Stable per-envelope document id: `<envelopeId>:<fileKey>`. */
export function documentExternalId(envelopeId: string, fileKey: string): string {
  return `${envelopeId}:${fileKey}`
}

function signingOrder(raw: RawEsignglobalEnvelope): 'parallel' | 'sequential' {
  const orders = (raw.signerInfos ?? []).map((s) => Number(s.signOrder ?? 1))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawEsignglobalEnvelope): Envelope {
  const status = mapStatus(raw.envelopeStatus)
  const signers = [...(raw.signerInfos ?? [])].sort(
    (a, b) => Number(a.signOrder ?? 1) - Number(b.signOrder ?? 1),
  )
  const docs = [...(raw.signFiles ?? []), ...(raw.attachments ?? [])].filter((f) => f.fileKey)
  return {
    id: raw.envelopeId,
    externalId: raw.envelopeId,
    status,
    subject: pickStr(raw.subject) ?? '',
    message: pickStr(raw.remark),
    senderName: pickStr(raw.initiatorInfo?.userName),
    signingOrder: signingOrder(raw),
    signerIds: signers.map((s) => signerExternalId(raw.envelopeId, s)),
    documentIds: docs.map((f) => documentExternalId(raw.envelopeId, String(f.fileKey))),
    createdAt: toIso(raw.envelopeCreateTime),
    completedAt: status === 'completed' ? toIso(raw.envelopeEndTime) : undefined,
    voidedAt: status === 'voided' ? toIso(raw.envelopeEndTime) : undefined,
    declinedAt: status === 'declined' ? toIso(raw.envelopeEndTime) : undefined,
    expiresAt: toIso(raw.envelopeExpireTime ?? raw.expireTime),
    platform: 'esignglobal',
    metadata: strMap({
      redirectUrl: raw.redirectUrl,
      canceledReason: raw.canceledReason,
      ccCount: Array.isArray(raw.CCInfos) ? raw.CCInfos.length : undefined,
    }),
    raw,
  }
}
