/**
 * Modusign fixtures built from the documented shapes.
 *
 * GET /documents/{documentId} — `GetDocumentResponseDto`, from the OpenAPI
 * definition on
 * https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md.
 * That page publishes a schema, not an example body, so every required field
 * is filled with a value of the documented type and enum.
 *
 * GET /documents/{documentId}/histories — `HistoryDto` entries copied from the
 * examples on https://developers.modusign.co.kr/docs/문서-이력-조회.md.
 */
import type {
  RawModusignDetailParticipant,
  RawModusignDocumentDetail,
} from '../../../../../../src/verticals/docsign/adapters/modusign/transform/document'
import type { RawModusignHistoryEntry } from '../../../../../../src/verticals/docsign/adapters/modusign/transform/audit-trail-entry'
import type { RawModusignDocument } from '../../../../../../src/verticals/docsign/adapters/modusign/transform/envelope'
import type { RawModusignTemplate } from '../../../../../../src/verticals/docsign/adapters/modusign/transform/template'

export function participant(
  i: number,
  over: Partial<RawModusignDetailParticipant> = {},
): RawModusignDetailParticipant {
  return {
    id: `p${i}`,
    type: 'SIGNER',
    name: `참여자 ${i}`,
    signingOrder: i,
    signingDue: { valid: true, datetime: '2026-10-01T00:00:00.000Z' },
    signingMethod: { type: 'EMAIL', value: `participant${i}@mail.com` },
    locale: 'ko',
    verification: null,
    ...over,
  }
}

export function documentDetail(
  over: Partial<RawModusignDocumentDetail> = {},
): RawModusignDocumentDetail {
  return {
    id: 'doc_1',
    title: '근로계약서',
    status: 'ON_GOING',
    requester: { email: 'requester@mail.com', name: '김요청' },
    participants: [participant(1), participant(2)],
    currentSigningOrder: 2,
    signings: [{ participantId: 'p1', signedAt: '2020-01-01T00:00:00.000Z' }],
    accessibleByParticipant: false,
    abort: null,
    updatedAt: '2020-01-01',
    createdAt: '2020-01-01',
    startedAt: '2020-01-01',
    file: { downloadUrl: 'https://files.example/doc_1.pdf' },
    auditTrail: { downloadUrl: 'https://files.example/doc_1-audit.pdf', locales: ['ko', 'en'] },
    seal: { integritySeal: { enabled: false, position: 'TOP_RIGHT' } },
    metadatas: [],
    labels: [],
    carbonCopies: [],
    ...over,
  }
}

/** `SIGNING_REQUEST`, verbatim from the history guide. */
export const SIGNING_REQUEST: RawModusignHistoryEntry = {
  message: '박참여(participant@mail.com)님에게 서명할 문서를 전송하였습니다.',
  timestamp: '2020-01-01T00:00:00.000Z',
  action: 'SIGNING_REQUEST',
  generator: { type: 'SYSTEM', name: null, contact: null, environment: null },
  target: { type: 'PARTICIPANT', name: '박참여', contact: 'participant@mail.com' },
  details: null,
}

/** `SIGNING_COMPLETED`, verbatim from the history guide. */
export const SIGNING_COMPLETED: RawModusignHistoryEntry = {
  message: '박참여(participant@mail.com)님이 문서에 서명하였습니다.',
  timestamp: '2020-01-01T00:00:00.000Z',
  action: 'SIGNING_COMPLETED',
  generator: {
    type: 'PARTICIPANT',
    name: '박참여',
    contact: 'participant@mail.com',
    environment: {
      userIp: '255.255.255.0',
      userAgent: 'Mozilla/5.0 (Windows; U; Windows NT 5.1; de-CH)...',
    },
  },
  target: null,
  details: null,
}

/** `VERIFICATION_FAILURE`, verbatim from the history guide. */
export const VERIFICATION_FAILURE: RawModusignHistoryEntry = {
  message: '박참여(participant@mail.com)님이 접근 암호 인증을 2회 실패하였습니다.',
  timestamp: '2020-01-01T00:00:00.000Z',
  action: 'VERIFICATION_FAILURE',
  generator: {
    type: 'PARTICIPANT',
    name: '박참여',
    contact: 'participant@mail.com',
    environment: {
      userIp: '255.255.255.0',
      userAgent: 'Mozilla/5.0 (Windows; U; Windows NT 5.1; de-CH)...',
    },
  },
  target: null,
  details: { authType: 'PASSWORD', failureCount: 2 },
}

/**
 * One entry of `documents[]` on GET /documents — `GetDocumentsResponseDocumentDto`
 * (https://developers.modusign.co.kr/reference/documentcontroller_getdocuments.md).
 * The page publishes a schema, not an example, so each required field holds a
 * value of its documented type and enum.
 */
export function listedDocument(
  i: number,
  over: Partial<RawModusignDocument> = {},
): RawModusignDocument {
  return {
    id: `doc_${i}`,
    title: `문서 ${i}`,
    status: 'ON_GOING',
    requester: { email: 'requester@mail.com', name: '김요청' },
    participants: [participant(1), participant(2)],
    currentSigningOrder: 1,
    signings: [],
    accessibleByParticipant: false,
    abort: null,
    updatedAt: '2020-01-02',
    createdAt: '2020-01-01',
    startedAt: '2020-01-01',
    file: { downloadUrl: `https://files.example/doc_${i}.pdf` },
    auditTrail: null,
    seal: { integritySeal: { enabled: false, position: 'TOP_RIGHT' } },
    metadatas: [{ key: '부서', value: '영업팀' }],
    labels: [],
    ...over,
  }
}

/**
 * One entry of `templates[]` on GET /templates — `TemplateInTemplatesResponseDto`
 * (https://developers.modusign.co.kr/reference/templatecontroller_gettemplates.md),
 * built from the schema: required id, metadatas, title, file, participants,
 * labels, createdAt, updatedAt; each participant type, role, signingOrder,
 * name, signingMethod.
 */
export function listedTemplate(
  i: number,
  over: Partial<RawModusignTemplate> = {},
): RawModusignTemplate {
  return {
    id: `tpl_${i}`,
    metadatas: [],
    title: `템플릿 ${i}`,
    file: { downloadUrl: `https://files.example/tpl_${i}.pdf` },
    participants: [
      { type: 'SIGNER', role: '갑', signingOrder: 1, name: null, signingMethod: null },
      {
        type: 'SIGNER',
        role: '을',
        signingOrder: 2,
        name: '김을',
        signingMethod: { type: 'EMAIL', value: 'eul@mail.com' },
      },
    ],
    labels: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
    ...over,
  }
}
