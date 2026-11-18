import type { Template } from '../../../schema/template'
import { toIso } from './shared'

/**
 * `TemplateInTemplatesResponseDto` — one entry of `templates[]` on
 * `GET /templates` (템플릿 리스트 조회,
 * https://developers.modusign.co.kr/reference/templatecontroller_gettemplates.md);
 * `GET /templates/{templateId}` (`GetTemplateResponseDto`,
 * https://developers.modusign.co.kr/reference/templatecontroller_gettemplate.md)
 * carries the same fields read here. Every one is in the schema's `required`
 * list.
 */
export interface RawModusignTemplate {
  /** "템플릿의 ID" */
  id: string
  /** "템플릿 제목" */
  title: string
  /** "템플릿 참여자 정보" — each with `role` ("참여자의 역할") */
  participants: Array<{ role: string; [key: string]: unknown }>
  /** "템플릿 생성 시간" (date-time) */
  createdAt: string
  /** "템플릿 마지막 업데이트 시간" (date-time) */
  updatedAt: string
  [key: string]: unknown
}

/**
 * A template is one PDF file (`file`: "템플릿 파일 정보", a single object).
 * `file.downloadUrl` is a 10-minute content link ("다운로드 링크(유효시간: 10분)"),
 * so it is dropped from `raw`.
 */
export function transformTemplate(raw: RawModusignTemplate): Template {
  if (typeof raw.title !== 'string') {
    throw new Error(`Modusign template ${raw.id} has no title (the template schema requires it)`)
  }
  const { file: _file, ...rest } = raw
  const participants = Array.isArray(raw.participants) ? raw.participants : []
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.title,
    signerRoles: participants.map((p) => p.role).filter((r): r is string => typeof r === 'string'),
    documentCount: 1,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'modusign',
    metadata: {},
    raw: rest,
  }
}
