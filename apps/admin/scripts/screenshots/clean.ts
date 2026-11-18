/**
 * Remove every fixture created by `seed.ts`.
 *
 * Safe to run any time — matches by the " (screenshot fixture)" marker,
 * the fixture tenant and reserved hosts, never by id, so real rows are
 * untouched even when they share a tenant or a name prefix. Where a row
 * could plausibly be real, the match is AND-gated on two markers (customers:
 * fixture tenant AND fixture email domain; webhooks: marker AND the
 * `.invalid` URL; tenants: fixture id AND marker).
 *
 * Some things can only be revoked, not deleted, by design: API keys, MCP
 * tokens and connect links stay listed as revoked/expired rows, which is how
 * the audit trail is meant to read. Everything else is deleted outright.
 *
 * Best-effort per step: a failure on one row warns + continues; the script
 * prints a final tally. Re-running is a no-op once the fixtures are gone.
 *
 * Usage:
 *   pnpm docs:screenshots:clean
 */
import {
  ADMIN_API,
  FIXTURE_EMAIL_DOMAIN,
  FIXTURE_SUFFIX,
  FIXTURE_TENANT,
  FIXTURE_TENANTS,
  FIXTURE_WEBHOOK_URL,
  authHeaders,
  login,
} from './seed'

interface TallyRow {
  step: string
  deleted: number
  failed: number
}

async function deleteOne(url: string, token: string): Promise<boolean> {
  try {
    // Bare Authorization header — no content-type, no body. Fastify rejects
    // `Content-Type: application/json` requests with an empty body, which
    // authHeaders() would inadvertently send.
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
    return res.status === 204 || res.ok
  } catch {
    return false
  }
}

/**
 * List `path`, keep the rows `isFixture` accepts, and DELETE each at
 * `${ADMIN_API}${deletePath(row)}`.
 */
async function cleanStep<T>(
  token: string,
  step: string,
  path: string,
  isFixture: (row: T) => boolean,
  deletePath: (row: T) => string,
): Promise<TallyRow> {
  const tally: TallyRow = { step, deleted: 0, failed: 0 }
  const res = await fetch(`${ADMIN_API}${path}`, { headers: authHeaders(token) })
  if (!res.ok) {
    console.warn(`[clean] list ${step} failed (${res.status}); skipping step`)
    return tally
  }
  const body = (await res.json()) as { data?: T[] }
  for (const row of body.data ?? []) {
    if (!isFixture(row)) continue
    const ok = await deleteOne(`${ADMIN_API}${deletePath(row)}`, token)
    if (ok) tally.deleted++
    else tally.failed++
  }
  return tally
}

const marked = (s: string | null | undefined) => !!s && s.includes(FIXTURE_SUFFIX)
const enc = encodeURIComponent
const fixtureTenantQuery = `tenantId=${enc(FIXTURE_TENANT)}`

export async function cleanFixtures(): Promise<TallyRow[]> {
  console.log('[clean] logging in…')
  const jwt = await login()

  // Order matters: tokens + sessions reference the customer; remove them
  // first so the customer delete doesn't surface as a FK-style surprise
  // (SQLite has no FK enforcement here, but the audit log reads cleaner).
  // Domains go before their tenants, which refuse deletion while they hold
  // one.
  const tally: TallyRow[] = []

  // Revocations — DELETE is a revoke; already-final rows would 404 and
  // inflate the failed tally, so only live ones are attempted.
  tally.push(
    await cleanStep<{ id: string; label: string | null; revokedAt?: unknown }>(
      jwt,
      'end-user-tokens',
      `/api/end-user-tokens?${fixtureTenantQuery}`,
      (r) => marked(r.label) && !r.revokedAt,
      (r) => `/api/end-user-tokens/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; label: string | null; status?: string }>(
      jwt,
      'connect-sessions',
      `/api/connect-sessions?${fixtureTenantQuery}`,
      (r) => marked(r.label) && (!r.status || r.status === 'active'),
      (r) => `/api/connect-sessions/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; label: string | null; revokedAt?: unknown }>(
      jwt,
      'api-keys',
      `/api/api-keys?${fixtureTenantQuery}`,
      (r) => marked(r.label) && !r.revokedAt,
      (r) => `/api/api-keys/${enc(r.id)}`,
    ),
  )

  // Deletions.
  tally.push(
    await cleanStep<{ id: string; label: string | null; url: string }>(
      jwt,
      'webhook-subscriptions',
      `/api/webhook-subscriptions?${fixtureTenantQuery}`,
      (r) => marked(r.label) && r.url === FIXTURE_WEBHOOK_URL,
      (r) => `/api/webhook-subscriptions/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; name: string }>(
      jwt,
      'connect-link-templates',
      '/api/connect-link-templates',
      (r) => marked(r.name),
      (r) => `/api/connect-link-templates/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: number; name: string }>(
      jwt,
      'scope-groups',
      '/api/scope-groups',
      (r) => marked(r.name),
      (r) => `/api/scope-groups/${enc(String(r.id))}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; name: string; builtin: boolean }>(
      jwt,
      'dashboards',
      '/api/dashboards',
      (r) => !r.builtin && marked(r.name),
      (r) => `/api/dashboards/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; name: string; isBuiltin: boolean }>(
      jwt,
      'roles',
      '/api/roles',
      (r) => !r.isBuiltin && marked(r.name),
      (r) => `/api/roles/${enc(r.id)}`,
    ),
  )
  tally.push(
    await cleanStep<{ id: string; name: string }>(
      jwt,
      'destinations',
      '/api/destinations',
      (r) => marked(r.name),
      (r) => `/api/destinations/${enc(r.id)}`,
    ),
  )
  tally.push(
    // Belt-and-suspenders: require BOTH the tenant filter AND the
    // email-domain pattern. Anything that doesn't match is a real customer
    // someone routed into the wrong tenant — leave alone.
    await cleanStep<{ id: string; email: string }>(
      jwt,
      'end-users',
      `/api/end-users?${fixtureTenantQuery}`,
      (r) => !!r.email?.endsWith('@' + FIXTURE_EMAIL_DOMAIN),
      (r) => `/api/end-users/${enc(r.id)}`,
    ),
  )
  const fixtureDomains = new Set(FIXTURE_TENANTS.map((t) => t.domain))
  tally.push(
    await cleanStep<{ domain: string }>(
      jwt,
      'tenant-domains',
      '/api/tenant-domains',
      (r) => fixtureDomains.has(r.domain),
      (r) => `/api/tenant-domains/${enc(r.domain)}`,
    ),
  )
  const fixtureTenantIds = new Set(FIXTURE_TENANTS.map((t) => t.id))
  tally.push(
    await cleanStep<{ id: string; name: string }>(
      jwt,
      'tenants',
      '/api/tenants',
      (r) => fixtureTenantIds.has(r.id) && marked(r.name),
      (r) => `/api/tenants/${enc(r.id)}`,
    ),
  )

  console.log('[clean] done')
  for (const row of tally) {
    console.log(`[clean]   ${row.step}: deleted=${row.deleted} failed=${row.failed}`)
  }
  return tally
}

if (require.main === module) {
  cleanFixtures().catch((err) => {
    console.error('[clean] failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
