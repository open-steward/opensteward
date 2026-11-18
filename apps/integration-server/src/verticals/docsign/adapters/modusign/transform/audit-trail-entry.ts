import { z } from 'zod'
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { strMap, toIso } from './shared'

/**
 * `HistoryDto` — one entry of `histories[]` on
 * `GET /documents/{documentId}/histories` (문서 이력 조회), per
 * https://developers.modusign.co.kr/reference/documentcontroller_getalldocumenthistories.md.
 * `message`, `timestamp`, `action`, `generator`, `target` and `details` are
 * all in that schema's `required` list.
 */
export interface RawModusignHistoryEntry {
  /** "이력을 문장으로 요약한 메세지" */
  message: string
  /** "이력이 발생한 시간" (date-time) */
  timestamp: string
  /** "이력의 액션" */
  action: string
  /** "이력의 발생자" */
  generator: {
    /** SYSTEM | PARTICIPANT | REQUESTER | ADMIN (nullable) */
    type: string | null
    name: string | null
    /** "발생자의 연락처 (이메일 또는 전화번호)" */
    contact: string | null
    environment: { userIp: string | null; userAgent: string } | null
  }
  /** "이력의 대상자" */
  target: { type: string; name: string; contact: string } | null
  details: { authType: string; failureCount: number | null } | null
}

export interface ModusignHistoriesResponse {
  histories: RawModusignHistoryEntry[]
}

/**
 * The documented `action` enum, mapped only where the Korean description
 * names a canonical event. Everything else is `other`.
 */
const ACTION_MAP: Record<string, AuditTrailEventType> = {
  START_SIGNING_REQUEST: 'sent', // 서명 요청 시작
  SIGNING_REQUEST: 'sent', // 서명 요청 됨
  SIGNING_REQUEST_TO_HOST: 'sent', // 호스트에게 서명 요청
  START_VIEW_ONLY_REQUEST: 'sent', // 열람 요청 시작
  VIEW_ONLY_REQUEST: 'sent', // 열람 요청
  FIRST_READING_DOCUMENT_IN_SIGNING_TURN: 'viewed', // 서명 차례에 첫 문서 조회
  READING_DOCUMENT_IN_SIGNING_TURN: 'viewed', // 서명 차례에 문서 조회
  FIRST_READING_VIEW_ONLY_IN_OWN_TURN: 'viewed', // 열람 요청자가 문서 처음 열람
  READING_VIEW_ONLY_IN_OWN_TURN: 'viewed', // 열람 요청자가 문서 열람
  VERIFICATION_COMPLETED: 'authenticated', // 인증 성공
  SIGNING_COMPLETED: 'signed', // 서명 입력
  SIGNING_COMPLETED_ALL: 'completed', // 모든 서명 입력 완료
  VIEW_ONLY_COMPLETED_ALL: 'completed', // 모든 열람 완료
  REJECT_SIGNING: 'declined', // 서명 거절
  CANCEL_SIGNING_REQUEST: 'voided', // 서명 요청 취소
  CANCEL_VIEW_ONLY_REQUEST: 'voided', // 열람 요청 취소
  CORRECT_SIGNING: 'corrected', // 서명 수정
}

function mapAction(action: string): AuditTrailEventType {
  return ACTION_MAP[action] ?? 'other'
}

/** `contact` is "이메일 또는 전화번호" — an email only when it parses as one. */
function emailOrUndefined(contact: string | null): string | undefined {
  if (contact === null) return undefined
  return z.email().safeParse(contact).success ? contact : undefined
}

/**
 * History entries carry no id. The id is the entry's position in the
 * `histories` array, scoped by document: `<documentId>:<index>`.
 */
export function transformAuditTrailEntry(
  raw: RawModusignHistoryEntry,
  envelopeId: string,
  index: number,
): AuditTrailEntry {
  const occurredAt = toIso(raw.timestamp)
  if (!occurredAt) {
    throw new Error(
      `Modusign history ${envelopeId}:${index} has no parseable timestamp (got ${JSON.stringify(raw.timestamp)})`,
    )
  }
  const id = `${envelopeId}:${index}`
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: mapAction(raw.action),
    description: raw.message,
    actorEmail: emailOrUndefined(raw.generator.contact),
    actorName: raw.generator.name ?? undefined,
    actorIp: raw.generator.environment?.userIp ?? undefined,
    platform: 'modusign',
    metadata: strMap({
      action: raw.action,
      generatorType: raw.generator.type,
      generatorContact: raw.generator.contact,
      targetName: raw.target?.name,
      targetContact: raw.target?.contact,
      authType: raw.details?.authType,
    }),
    raw,
  }
}
