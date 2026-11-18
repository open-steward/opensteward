import type { Credentials } from '@opensteward/shared'

/**
 * Payabli API tokens are "long-lived tokens you send in the `requestToken`
 * header" (https://docs.payabli.com/developers/api-tokens.md).
 *
 * Two per-connection values the list endpoints need are kept in `extra` when
 * the connect form submits them:
 * - `entry`: the paypoint entrypoint every `/Query/<resource>/{entry}` list
 *   takes as a path parameter ("The entity's entrypoint identifier.").
 * - `currency`: the paypoint's currency, `USD` or `CAD`, used only for rows
 *   that carry no `paymentDetails.currency` of their own (invoice records
 *   carry none at all).
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const extra: Record<string, string> = {}
  if (fields.entry) extra.entry = fields.entry
  if (fields.currency) extra.currency = fields.currency
  return {
    accessToken: fields.apiKey ?? '',
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  }
}

/** The connection's paypoint entrypoint, when it has one. */
export function connectionEntry(credentials: Credentials): string | undefined {
  const v = credentials.extra?.entry
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** The connection's configured currency, when it holds a valid ISO code. */
export function connectionCurrency(credentials: Credentials): string | undefined {
  const v = credentials.extra?.currency
  return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : undefined
}
