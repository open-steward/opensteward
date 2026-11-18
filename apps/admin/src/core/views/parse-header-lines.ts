/**
 * Parses the admin form's custom-header textarea: one `Name: value` per line.
 *
 * There is no repeatable key/value widget in this admin app, and a header set
 * is a power-user field — a textarea parsed on the server is the same shape
 * the scope-groups editor already uses for free-text entry, with less
 * JavaScript to go wrong.
 *
 * Every malformed line is reported with its line number rather than repaired.
 * A header value is a credential; a parser that quietly drops or trims one
 * produces a subscription that reads correctly on the page and fails at the
 * receiver, which is far harder to diagnose than a message at save time.
 */
import { validateHeaders } from '@opensteward/shared'

export type ParseHeaderLinesResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; error: string }

export function parseHeaderLines(input: string | undefined | null): ParseHeaderLinesResult {
  const text = (input ?? '').trim()
  if (text.length === 0) return { ok: true, value: {} }

  const headers: Record<string, string> = {}
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue

    const colon = line.indexOf(':')
    if (colon === -1) {
      return { ok: false, error: `Line ${i + 1} is not a header. Use "Name: value".` }
    }

    const name = line.slice(0, colon).trim()
    // Only the separator's whitespace is stripped; a value's own inner
    // spacing is part of the credential.
    const value = line.slice(colon + 1).trim()

    if (name.length === 0) {
      return { ok: false, error: `Line ${i + 1} has no header name. Use "Name: value".` }
    }
    if (value.length === 0) {
      return { ok: false, error: `Line ${i + 1} ("${name}") has no value.` }
    }

    const lower = name.toLowerCase()
    if (seen.has(lower)) {
      return {
        ok: false,
        error: `Line ${i + 1} repeats the header "${name}" (duplicate names are not allowed).`,
      }
    }
    seen.add(lower)
    headers[name] = value
  }

  // Same rule the API and the delivery layer enforce, applied here so the
  // operator is told which header is wrong while the form is still in front
  // of them.
  const validated = validateHeaders(headers)
  if (!validated.ok) {
    const reason = validated.reason
    return { ok: false, error: reason.charAt(0).toUpperCase() + reason.slice(1) + '.' }
  }

  return { ok: true, value: headers }
}

/** Renders a header map back into textarea lines, for redisplay after an error. */
export function formatHeaderLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n')
}
