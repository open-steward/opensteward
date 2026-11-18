/**
 * Per-customer OAuth inputs (`oauthFields`).
 *
 * Some OAuth providers host the authorize and token endpoints on a
 * per-customer host — Shopify's `{shop}.myshopify.com`, Zendesk's
 * `{subdomain}.zendesk.com`. That value belongs to the customer's connection,
 * not to the deployment's adapter config, so the Connect flow has to ask for
 * it BEFORE redirecting. Adapters declare what they need via
 * `BaseAdapter.oauthFields()`; this filter decides what of the caller's input
 * actually reaches the adapter and, later, `credentials.extra`.
 */
import type { CredentialField } from '../adapter/base'

export interface CollectedOAuthInputs {
  /**
   * `null` when the adapter declares no `oauthFields` — the flow is then
   * byte-for-byte what it was before inputs existed, whatever the caller sent.
   */
  inputs: Record<string, string> | null
  /** Names of required fields that were absent or blank. */
  missing: string[]
}

/**
 * Filter a caller-supplied record down to the inputs an adapter declared.
 * Undeclared keys are dropped (nothing a customer types reaches
 * `credentials.extra` unless the adapter asked for it), values are trimmed,
 * and blanks count as absent so a required field cannot be satisfied with
 * whitespace.
 */
export function collectOAuthInputs(
  fields: readonly CredentialField[] | undefined,
  raw: unknown,
): CollectedOAuthInputs {
  if (!fields || fields.length === 0) return { inputs: null, missing: [] }
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const inputs: Record<string, string> = {}
  const missing: string[] = []
  for (const f of fields) {
    const v = src[f.name]
    const s = typeof v === 'string' ? v.trim() : ''
    if (s) inputs[f.name] = s
    else if (f.required) missing.push(f.name)
  }
  return { inputs, missing }
}
