import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Signable templates. The list (`TemplatesListResponse`) and the single-get
 * (`TemplateGetResponse`) both return the `TemplateSummary` shape. A template
 * is a single uploaded document with predefined party roles; `template_parties`
 * carries each role's name. Signable surfaces only an upload timestamp
 * (`template_uploaded`) — there is no separate created/modified pair.
 */
export interface RawSignableTemplateParty {
  party_id?: string
  party_name?: string
  [key: string]: unknown
}

export interface RawSignableTemplate {
  template_id?: string
  template_fingerprint: string
  template_title?: string
  template_page_total?: string
  template_parties_total?: string
  template_uploaded?: string
  template_parties?: RawSignableTemplateParty[]
  [key: string]: unknown
}

export function transformTemplate(raw: RawSignableTemplate): Template {
  return {
    id: raw.template_fingerprint,
    externalId: raw.template_fingerprint,
    name: pickStr(raw.template_title) ?? '',
    signerRoles: (raw.template_parties ?? [])
      .map((p) => pickStr(p.party_name))
      .filter((n): n is string => typeof n === 'string'),
    // A Signable template wraps a single uploaded document.
    documentCount: 1,
    createdAt: toIso(raw.template_uploaded),
    platform: 'signable',
    metadata: strMap({
      templateId: raw.template_id,
      pageTotal: raw.template_page_total,
      partiesTotal: raw.template_parties_total,
    }),
    raw,
  }
}
