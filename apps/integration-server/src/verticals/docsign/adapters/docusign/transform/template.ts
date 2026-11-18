import type { Template } from '../../../schema/template'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawDocuSignTemplate {
  templateId: string
  name?: string
  description?: string
  created?: string
  lastModified?: string
  shared?: string
  emailSubject?: string
  envelopeTemplateDefinition?: unknown
  recipients?: { signers?: Array<{ roleName?: string }> }
  documents?: Array<{ documentId: string }>
  pageCount?: string | number
  [key: string]: unknown
}

export function transformTemplate(raw: RawDocuSignTemplate): Template {
  return {
    id: raw.templateId,
    externalId: raw.templateId,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    signerRoles: (raw.recipients?.signers ?? [])
      .map((s) => s.roleName)
      .filter((r): r is string => typeof r === 'string'),
    documentCount: Array.isArray(raw.documents) ? raw.documents.length : (pickNum(raw.pageCount) ?? 0),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.lastModified),
    platform: 'docusign',
    metadata: strMap({ shared: raw.shared, emailSubject: raw.emailSubject }),
    raw,
  }
}
