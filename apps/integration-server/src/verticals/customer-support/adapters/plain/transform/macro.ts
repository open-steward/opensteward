/**
 * Plain snippet → canonical Macro transform.
 *
 * Plain "snippets" are reusable canned-response pieces of text.
 * Docs: https://www.plain.com/docs/graphql/snippets
 *
 * Confirmed schema (https://core-api.uk.plain.com/graphql/v1/schema.graphql):
 *   type Snippet { id, name, text, markdown, path, isDeleted,
 *                  createdAt: DateTime!, updatedAt: DateTime! }
 *   type DateTime { iso8601: String! }
 *   query snippets(first, after): SnippetConnection!
 *   query snippet(snippetId: ID!): Snippet
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPlainSnippet {
  id: string
  name?: string | null
  /** Plain-text body */
  text?: string | null
  /** Optional markdown body */
  markdown?: string | null
  /** Alphanumeric grouping path, e.g. "billing/refunds" */
  path?: string | null
  isDeleted?: boolean | null
  createdAt?: { iso8601?: string | null } | null
  updatedAt?: { iso8601?: string | null } | null
  [key: string]: unknown
}

export function transformMacro(raw: RawPlainSnippet): Macro {
  return {
    id: raw.id,
    externalId: raw.id,
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.text) ?? pickStr(raw.markdown) ?? '',
    category: pickStr(raw.path),
    platform: 'plain',
    metadata: strMap({
      markdown: raw.markdown,
      isDeleted: raw.isDeleted,
      createdAt: raw.createdAt?.iso8601,
      updatedAt: toIso(raw.updatedAt?.iso8601),
    }),
    raw,
  }
}
