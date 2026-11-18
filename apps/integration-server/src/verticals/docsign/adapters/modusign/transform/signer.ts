import { z } from 'zod'
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { strMap, toIso } from './shared'
import type { RawModusignDetailParticipant, RawModusignDocumentDetail } from './document'

/**
 * One entry of `participants[]` on `GET /documents/{documentId}`
 * (https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md).
 *
 * A participant carries no status or timestamps of its own. The document
 * does: `signings[]` ("입력된 서명, 열람 완료된 참여자 리스트") lists who
 * has signed and when, `abort` ("문서의 중단 정보") names the participant who
 * rejected, and `currentSigningOrder` ("현재 참여 차례") is whose turn it is.
 * So a signer is transformed against the document that holds it.
 */

/** "참여자 타입": `SIGNER` (서명자) or `VIEWER` (열람자). Modusign's viewer has no canonical role. */
function mapRole(type: string): SignerRole {
  return type === 'SIGNER' ? 'signer' : 'unknown'
}

function mapStatus(
  p: RawModusignDetailParticipant,
  doc: RawModusignDocumentDetail,
  signing: { signedAt: string } | undefined,
  rejected: boolean,
): SignerStatus {
  if (signing) return 'signed'
  if (rejected) return 'declined'
  // "`DRAFT` - 작성 중", "`SCHEDULED` - 전송 예약 중": nothing has been sent yet.
  if (doc.status === 'DRAFT' || doc.status === 'SCHEDULED') return 'created'
  // "`ON_GOING` - 서명/열람 진행 중": the participant whose order is the
  // document's current turn has been asked; later orders have not.
  if (doc.status === 'ON_GOING') {
    if (p.signingOrder === doc.currentSigningOrder) return 'sent'
    if (p.signingOrder > doc.currentSigningOrder) return 'created'
  }
  return 'unknown'
}

/** The documented `signingMethod.value` is an address only when its type is `EMAIL`. */
function emailOf(p: RawModusignDetailParticipant): string | undefined {
  if (p.signingMethod.type !== 'EMAIL') return undefined
  return z.email().safeParse(p.signingMethod.value).success ? p.signingMethod.value : undefined
}

/**
 * `verification` ("참여자 추가 인증") carries identity-check data: the
 * 휴대폰 본인인증 name and phone number, a password hint, a business number.
 * It is not passed through `raw`.
 */
function withoutVerification(p: RawModusignDetailParticipant): Record<string, unknown> {
  const { verification: _verification, ...rest } = p
  return rest
}

export function transformSigner(
  p: RawModusignDetailParticipant,
  doc: RawModusignDocumentDetail,
): Signer {
  // `signings` is required on GetDocumentResponseDto. Without it a participant
  // who signed would read as 'sent' or 'created', so a body missing it fails.
  if (!Array.isArray(doc.signings)) {
    throw new Error(
      `Modusign document ${doc.id} has no signings[] (GetDocumentResponseDto requires it)`,
    )
  }
  const signing = doc.signings.find((s) => s.participantId === p.id)
  const rejected = doc.abort?.type === 'REJECTION' && doc.abort.participantId === p.id
  const routingOrder =
    Number.isInteger(p.signingOrder) && p.signingOrder >= 1 ? p.signingOrder : undefined
  return {
    id: p.id,
    externalId: p.id,
    envelopeId: doc.id,
    email: emailOf(p),
    name: p.name,
    role: mapRole(p.type),
    status: mapStatus(p, doc, signing, rejected),
    routingOrder,
    signedAt: signing ? toIso(signing.signedAt) : undefined,
    declinedAt: rejected ? toIso(doc.abort?.abortedAt) : undefined,
    declineReason: rejected ? doc.abort?.message : undefined,
    platform: 'modusign',
    metadata: strMap({
      participantType: p.type,
      signingMethodType: p.signingMethod.type,
    }),
    raw: withoutVerification(p),
  }
}
