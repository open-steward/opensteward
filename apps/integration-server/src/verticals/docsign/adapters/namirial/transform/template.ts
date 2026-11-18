/**
 * `GET /v6/template/{templateId}` (`TemplateGetResponse`) plus
 * `GET /v6/template/{templateId}/files` (`TemplateGetFilesResponse`) →
 * canonical Template.
 *
 * `signerRoles` are the template's signer placeholders
 * (`Action.SignPlaceholder.PlaceholderLabel`: "The label of the
 * placeholder."); activities addressed to a concrete contact define no role.
 * The swagger documents no description or modification date for templates.
 *
 * Swagger: https://demo.esignanywhere.net/swagger/jsons/swagger.v6.json
 */
import type { Template } from '../../../schema/template'
import type { RawNamirialTemplate, RawNamirialTemplateFiles } from '../types'
import { pickStr, strMap, toIso } from './shared'

export function transformTemplate(
  raw: RawNamirialTemplate,
  files: RawNamirialTemplateFiles,
): Template {
  const id = pickStr(raw.Id)
  if (!id) throw new Error('Namirial template has no Id')
  const name = pickStr(raw.Name)
  if (!name) throw new Error(`Namirial template ${id} has no Name`)
  return {
    id,
    externalId: id,
    name,
    signerRoles: (raw.Activities ?? [])
      .map((a) => pickStr(a.Action?.SignPlaceholder?.PlaceholderLabel))
      .filter((label): label is string => label !== undefined),
    documentCount: (files.Documents ?? []).length,
    createdAt: toIso(raw.CreationDate),
    platform: 'namirial',
    metadata: strMap({}),
    raw: { template: raw, files },
  }
}
