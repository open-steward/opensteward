import type { Document } from '../../../schema/document'
import { strMap } from './shared'
import { stripModusignContent } from './envelope'

/**
 * `GetDocumentResponseDto` — the body of `GET /documents/{documentId}`
 * (문서 상세 조회), as the OpenAPI definition on
 * https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md
 * declares it. Only the fields this adapter reads are typed; every one of
 * them is in that schema's `required` list.
 */
export interface RawModusignSigningMethod {
  /** "참여 수단 종류": EMAIL | KAKAO | SECURE_LINK | IN_PERSON */
  type: string
  /** "참여 수단 값" */
  value: string
}

export interface RawModusignDetailParticipant {
  /** "참여자 ID" */
  id: string
  /** "참여자 타입": SIGNER (GetDocumentResponseSignerDto) or VIEWER (GetDocumentResponseViewerDto) */
  type: string
  /** "참여자 이름" */
  name: string
  /** "참여자의 참여 순서" */
  signingOrder: number
  signingMethod: RawModusignSigningMethod
  [key: string]: unknown
}

export interface RawModusignSigning {
  /** "참여한 참여자 ID" */
  participantId: string
  /** "참여한 시간" */
  signedAt: string
}

export interface RawModusignAbort {
  /** REJECTION | SIGNING_CANCELLATION | REQUEST_CANCELLATION */
  type: string
  /** "중단 사유" */
  message: string
  /** "중단 시점" */
  abortedAt: string
  /** "중단한 참여자 ID (거절 또는 참여 취소 시)" */
  participantId: string | null
}

export interface RawModusignDocumentDetail {
  /** "문서 ID" */
  id: string
  /** "문서 제목" */
  title: string
  /** ON_GOING | MODIFYING | APPROVAL_PENDING | DRAFT | ON_PROCESSING | PROCESSING_FAILED | ABORTED | COMPLETED | SCHEDULED */
  status: string
  participants: RawModusignDetailParticipant[]
  /** "현재 참여 차례" */
  currentSigningOrder: number
  /** "입력된 서명, 열람 완료된 참여자 리스트" */
  signings: RawModusignSigning[]
  /** "문서의 중단 정보" */
  abort: RawModusignAbort | null
  [key: string]: unknown
}

/**
 * The Modusign document IS the envelope: one record, one file. Its file is a
 * PDF — the schema names it `PdfFileInDocumentResponseDto` ("문서 PDF 파일
 * 정보"). Title + metadata only: `file` and `auditTrail` carry 10-minute
 * `downloadUrl`s to the content ("다운로드 링크(유효시간: 10분)"), so both are
 * dropped from `raw` rather than passed through, as is each participant's
 * `verification` (identity-check data).
 */
export function transformDocument(raw: RawModusignDocumentDetail): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: raw.title,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'modusign',
    metadata: strMap({ status: raw.status }),
    raw: stripModusignContent(raw),
  }
}
