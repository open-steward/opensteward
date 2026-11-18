/**
 * Jitbit Helpdesk "canned responses" / "comment templates" map to the
 * canonical Macro schema.
 *
 * GET /CommentTemplates returns an array of template objects.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawJitbitCommentTemplate {
  /** Template ID — API field name is TemplateId (not CommentTemplateID) */
  TemplateId?: number
  Name?: string
  Body?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawJitbitCommentTemplate): Macro {
  return {
    id: String(raw.TemplateId ?? ''),
    externalId: String(raw.TemplateId ?? ''),
    title: pickStr(raw.Name) ?? '',
    body: pickStr(raw.Body) ?? '',
    category: undefined,
    platform: 'jitbit-helpdesk',
    metadata: strMap({}),
    raw,
  }
}
