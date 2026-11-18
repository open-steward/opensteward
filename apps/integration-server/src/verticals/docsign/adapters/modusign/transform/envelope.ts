import { z } from 'zod'
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { strMap, toIso } from './shared'

/**
 * `GetDocumentsResponseDocumentDto` — one entry of `documents[]` on
 * `GET /documents` (문서 리스트 조회,
 * https://developers.modusign.co.kr/reference/documentcontroller_getdocuments.md).
 * `GET /documents/{documentId}` (`GetDocumentResponseDto`) carries the same
 * fields. Only the fields this transform reads are typed; the schema lists
 * every one of them as required. They are optional here so a body missing
 * one yields an absent canonical field, never an invented value.
 */
export interface RawModusignEnvelopeParticipant {
  /** "참여자 ID" */
  id: string
  /** "참여자의 참여 순서" */
  signingOrder?: number
  [key: string]: unknown
}

export interface RawModusignDocument {
  /** "문서 ID" */
  id: string
  /** "문서 제목" */
  title?: string
  /** DRAFT | SCHEDULED | ON_GOING | MODIFYING | APPROVAL_PENDING | ON_PROCESSING | PROCESSING_FAILED | ABORTED | COMPLETED */
  status?: string
  /** "문서 요청자 정보": `{ email, name }` */
  requester?: { email?: string; name?: string }
  /** "참여자 리스트" */
  participants?: RawModusignEnvelopeParticipant[]
  /** "문서의 중단 정보" */
  abort?: {
    /** REJECTION | SIGNING_CANCELLATION | REQUEST_CANCELLATION */
    type?: string
    /** "중단 시점" */
    abortedAt?: string
  } | null
  /** "마지막 업데이트 시간" */
  updatedAt?: string
  /** "문서 생성 시간" */
  createdAt?: string
  /** "참여 요청 시간" (nullable) */
  startedAt?: string | null
  /** "메타데이터 리스트": `{ key, value }[]` */
  metadatas?: Array<{ key: string; value: string }>
  [key: string]: unknown
}

/**
 * The documented status enum ("문서 상태"):
 *   `DRAFT` 작성 중, `SCHEDULED` 전송 예약 중 → draft (nothing sent yet)
 *   `ON_GOING` 서명/열람 진행 중 → sent
 *   `COMPLETED` 모든 서명/열람 완료 → completed
 *   `ABORTED` 서명/열람 중단됨 → by `abort.type`: `REJECTION` (a
 *     participant rejected) → declined; `SIGNING_CANCELLATION` /
 *     `REQUEST_CANCELLATION` → voided.
 * `MODIFYING`, `APPROVAL_PENDING`, `ON_PROCESSING`, `PROCESSING_FAILED` have
 * no canonical equivalent → unknown (the raw status is kept in metadata).
 */
function mapStatus(raw: RawModusignDocument): EnvelopeStatus {
  switch (raw.status) {
    case 'DRAFT':
    case 'SCHEDULED':
      return 'draft'
    case 'ON_GOING':
      return 'sent'
    case 'COMPLETED':
      return 'completed'
    case 'ABORTED':
      if (raw.abort?.type === 'REJECTION') return 'declined'
      if (raw.abort?.type === 'SIGNING_CANCELLATION' || raw.abort?.type === 'REQUEST_CANCELLATION')
        return 'voided'
      return 'unknown'
    default:
      return 'unknown'
  }
}

function emailOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' && z.email().safeParse(v).success ? v : undefined
}

/**
 * `file` and `auditTrail` carry 10-minute `downloadUrl`s to the content
 * ("다운로드 링크(유효시간: 10분)"), and each participant's `verification`
 * carries identity-check data (휴대폰 본인인증 phone number, password hint, …).
 * None of it is passed through `raw`.
 */
export function stripModusignContent<T extends { participants?: unknown }>(
  raw: T,
): Omit<T, 'file' | 'auditTrail'> {
  const {
    file: _file,
    auditTrail: _auditTrail,
    ...rest
  } = raw as T & {
    file?: unknown
    auditTrail?: unknown
  }
  if (!Array.isArray(rest.participants)) return rest
  return {
    ...rest,
    participants: rest.participants.map((p: unknown) => {
      if (!p || typeof p !== 'object') return p
      const { verification: _v, ...pRest } = p as Record<string, unknown>
      return pRest
    }),
  }
}

export function transformEnvelope(raw: RawModusignDocument): Envelope {
  const participants = Array.isArray(raw.participants) ? raw.participants : []
  const orders = participants
    .map((p) => p.signingOrder)
    .filter((o): o is number => typeof o === 'number')
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  const status = mapStatus(raw)
  const abortedAt = raw.status === 'ABORTED' ? toIso(raw.abort?.abortedAt) : undefined
  const metadata = strMap(
    Object.fromEntries(
      (Array.isArray(raw.metadatas) ? raw.metadatas : []).map((m) => [m.key, m.value]),
    ),
  )
  if (raw.status) metadata['modusignStatus'] = raw.status
  if (typeof raw.title !== 'string') {
    throw new Error(
      `Modusign document ${raw.id} has no title (GetDocumentsResponseDocumentDto requires it)`,
    )
  }
  return {
    id: raw.id,
    externalId: raw.id,
    status,
    subject: raw.title,
    senderEmail: emailOrUndefined(raw.requester?.email),
    senderName: raw.requester?.name || undefined,
    signingOrder: signing,
    signerIds: participants.map((p) => p.id).filter((k): k is string => typeof k === 'string'),
    documentIds: [raw.id],
    createdAt: toIso(raw.createdAt),
    sentAt: toIso(raw.startedAt),
    updatedAt: toIso(raw.updatedAt),
    declinedAt: status === 'declined' ? abortedAt : undefined,
    voidedAt: status === 'voided' ? abortedAt : undefined,
    platform: 'modusign',
    metadata,
    raw: stripModusignContent(raw),
  }
}
