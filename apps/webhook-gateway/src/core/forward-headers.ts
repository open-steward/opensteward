import type { IncomingHttpHeaders } from 'node:http'

/**
 * Which inbound headers the gateway relays to integration-server.
 *
 * A deny-list, not an allow-list: providers sign with headers of every shape
 * (`intuit-signature`, `webhook-id`/`webhook-timestamp`, `svix-*`,
 * `paddle-signature`, …), and an allow-list silently breaks each new one.
 * Dropped: hop-by-hop headers (RFC 9110 §7.6.1) and any header the
 * `Connection` header names; `host` and `content-length`, which describe this
 * hop; `cookie`; the internal `x-admin-secret` / `x-service-secret`
 * channels; and client-supplied `x-forwarded-*`, which a caller must not be
 * able to set on a request that integration-server receives from the gateway.
 */
const DROP = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'x-admin-secret',
  'x-service-secret',
])

export function forwardableHeaders(incoming: IncomingHttpHeaders): Record<string, string> {
  const named = new Set(
    String(incoming['connection'] ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  const out: Record<string, string> = {}
  for (const [rawName, value] of Object.entries(incoming)) {
    if (value === undefined) continue
    const name = rawName.toLowerCase()
    if (DROP.has(name) || named.has(name) || name.startsWith('x-forwarded-')) continue
    out[name] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}
