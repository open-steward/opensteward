/**
 * Transform a Genesys Cloud response asset (canned response) to the
 * canonical Macro schema.
 *
 * Genesys Cloud's "Response Management" library stores pre-built responses
 * (canned responses / response templates) that agents can insert during
 * conversations — the closest equivalent to macros.
 *
 *   GET /api/v2/responsemanagement/responses  — list responses
 *   GET /api/v2/responsemanagement/responses/{responseId}  — single response
 *
 * Fields: id, name, libraries[].id, texts[].content, texts[].contentType,
 *   topic, dateCreated, dateModified, selfUri.
 *
 * Docs: https://developer.genesys.cloud/useragentman/responsemanagement/
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGenesysResponseText {
  content?: string
  contentType?: string
  [key: string]: unknown
}

export interface RawGenesysResponseLibrary {
  id?: string
  name?: string
  [key: string]: unknown
}

export interface RawGenesysResponse {
  id?: string
  name?: string
  /** Topic / category */
  topic?: string | null
  texts?: RawGenesysResponseText[]
  libraries?: RawGenesysResponseLibrary[]
  [key: string]: unknown
}

function extractBody(raw: RawGenesysResponse): string {
  // Prefer plain text content; fall back to first available text
  const texts = raw.texts ?? []
  const plain = texts.find((t) => t.contentType === 'text/plain')
  if (plain) return pickStr(plain.content) ?? ''
  return pickStr(texts[0]?.content) ?? ''
}

export function transformMacro(raw: RawGenesysResponse): Macro {
  const id = pickStr(raw.id) ?? ''
  const libraryName = raw.libraries?.[0]?.name

  return {
    id,
    externalId: id,
    title: pickStr(raw.name) ?? '',
    body: extractBody(raw),
    category: pickStr(raw.topic ?? libraryName),
    platform: 'genesys-cloud',
    metadata: strMap({
      libraryId: raw.libraries?.[0]?.id,
      libraryName,
    }),
    raw,
  }
}
