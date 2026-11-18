/**
 * Sandbox mock OAuth ceremony + hosted mock connect pages, under `/test/v1`.
 *
 * The live `/auth/{vertical}/{platform}/connect` → provider → `/callback`
 * dance can never run in the sandbox: it needs an enabled adapter with real
 * OAuth client config and a live upstream token exchange, and the sandbox is
 * no-egress by contract. This router simulates the whole ceremony against the
 * one synthetic platform (`sandbox`) instead, so a developer can exercise the
 * connect journey — including the browser part — with nothing but a test key:
 *
 *   GET /test/v1/auth/{vertical}/sandbox/connect?tenant_id=…
 *     → 302 to the hosted mock authorize page (Approve / Deny), or, with
 *       ?outcome=granted|denied|error|expired, straight to the callback so
 *       the flow is drivable programmatically.
 *   GET /test/v1/auth/{vertical}/sandbox/callback?code&state
 *     → 201 { data: { id: <derived sandbox connection id>, … } } — or the
 *       matching 400 for denied/error/replayed-state outcomes.
 *   GET /test/v1/connect/{token}          hosted mock picker (from a sandbox
 *   GET /test/v1/connect/{token}/done     connect link) and thank-you page.
 *
 * INVARIANT: the only connection id this router can ever emit is
 * `sandboxConnectionId(tenantId, vertical)` — the same derived id the sandbox
 * auth middleware whitelists. Denied/error outcomes return error payloads and
 * no id. Nothing is minted, nothing is stored beyond the pending OAuth state.
 *
 * UNAUTHENTICATED BY DESIGN, like the live `/auth` GET ceremony and the whole
 * live `/connect/*` surface: these routes are opened by an end-customer's
 * browser, which carries no Authorization header. They are still gated by the
 * test-mode flag and an IP-keyed rate limit. Registered as a SIBLING of the
 * bearer-authenticated sandbox routers inside the `/test/v1` encapsulation
 * (the same placement as the self-serve keys router).
 *
 * NO EGRESS. Imports are leaf-only (`rate-limit`, `branding-head`,
 * `public-base-url`, `sandbox/ids`, `sandbox-link-token`, node:crypto), the
 * operator branding VALUE is injected via options (HostInfoFetcher itself
 * does network I/O — only its type is imported), and the rendered pages ship
 * ZERO JavaScript: Approve/Deny are plain links, so the pages contain no
 * fetch/XHR text and the CSP can pin `script-src 'none'`.
 *
 * Pending OAuth state lives in an in-closure Map with a 10-minute TTL and
 * delete-on-consume — the same semantics (and the same single-replica
 * limitation) as the live flow's `auth/oauth.ts`. One-time consume is what
 * makes INVALID_STATE / replay exercisable, which is half the teaching value.
 */
import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { RateLimitConfig } from './rate-limit'
import { consume } from './rate-limit'
import { sandboxConnectionId } from '../sandbox/ids'
import { brandingHead } from './branding-head'
import type { HostBranding } from './host-info'
import { decodeSandboxLinkToken } from './sandbox-link-token'

export interface SandboxAuthRouterOptions {
  /** Verticals with a sandbox mount — the only verticals the ceremony accepts. */
  verticals: readonly string[]
  testModeEnabled?: () => boolean
  /** IP-keyed budget for the unauthenticated pages (browser traffic). */
  rateLimit?: RateLimitConfig | ((request: FastifyRequest) => RateLimitConfig)
  /** Injected branding VALUE — never fetched from here (no egress). */
  getHostBranding?: () => Promise<HostBranding>
}

interface PendingSandboxState {
  vertical: string
  tenantId: string
  label: string | null
  linkToken: string | null
  expiresAt: number
}

const STATE_TTL_MS = 10 * 60 * 1000
const OUTCOMES = ['granted', 'denied', 'error', 'expired'] as const
type Outcome = (typeof OUTCOMES)[number]

const EMPTY_BRANDING: HostBranding = {
  name: null,
  logoDataUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontFamily: null,
  fontDataUrl: null,
  fontUrl: null,
  faviconDataUrl: null,
  hideAttribution: false,
  supportEmail: null,
  privacyPolicyUrl: null,
  termsOfServiceUrl: null,
} as HostBranding

// ── HTML (zero-JS, branded, everything interpolated is escaped) ─────────────

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Static CSP for pages that ship no JavaScript at all — `script-src 'none'`
 *  is strictly tighter than the live connect pages' nonce scheme. Styles stay
 *  inline-allowed for operator branding, matching live. */
const SANDBOX_PAGE_CSP =
  "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self' data:; base-uri 'none'; " +
  "form-action 'self'; frame-ancestors 'none'"

const PAGE_CSS = `
  body { margin: 0; font-family: var(--font-sans, system-ui, sans-serif);
         background: #f6f7f9; color: #1a1d21; display: grid; min-height: 100vh;
         place-items: center; }
  .card { background: #fff; border: 1px solid #e2e5ea; border-radius: 12px;
          padding: 2rem 2.25rem; max-width: 30rem; width: calc(100% - 2rem);
          box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size: 1.15rem; margin: 0 0 .5rem; }
  p { margin: .4rem 0; color: #4b5563; font-size: .92rem; line-height: 1.5; }
  code { background: #f1f3f6; border-radius: 4px; padding: .1rem .3rem;
         font-size: .85em; word-break: break-all; }
  .actions { display: flex; gap: .75rem; margin-top: 1.25rem; }
  .btn { display: inline-block; padding: .55rem 1.1rem; border-radius: 8px;
         text-decoration: none; font-size: .92rem; font-weight: 600; }
  .approve { background: var(--accent, #0f766e); color: #fff; }
  .deny { background: #eef0f3; color: #1a1d21; }
  .list { list-style: none; padding: 0; margin: 1rem 0 0; }
  .list li { margin: .35rem 0; }
  .list a { color: var(--accent, #0f766e); text-decoration: none;
            font-weight: 600; font-size: .95rem; }
  .badge { display: inline-block; background: #fef3c7; color: #92400e;
           border-radius: 999px; padding: .15rem .6rem; font-size: .72rem;
           font-weight: 700; letter-spacing: .03em; margin-bottom: .75rem; }
`

function page(host: HostBranding, title: string, body: string): string {
  const brand = host.name ? escapeHtml(host.name) : 'OpenSteward'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${brand}</title>
${brandingHead(host)}
<style>${PAGE_CSS}</style>
</head>
<body>
<main class="card">
<span class="badge">SANDBOX — TEST MODE</span>
${body}
</main>
</body>
</html>`
}

function authorizeHtml(args: {
  host: HostBranding
  vertical: string
  state: string
  callbackPath: string
}): string {
  const cb = escapeHtml(args.callbackPath)
  const st = encodeURIComponent(args.state)
  return page(
    args.host,
    'Authorize sandbox access',
    `<h1>Authorize ${escapeHtml(args.vertical)} sandbox access?</h1>
<p>This is the sandbox's mock authorize page — the stand-in for a real
platform's consent screen. Nothing is contacted and no real data is shared.</p>
<div class="actions">
<a class="btn approve" href="${cb}?code=sbx_approved&amp;state=${st}">Approve</a>
<a class="btn deny" href="${cb}?error=access_denied&amp;state=${st}">Deny</a>
</div>`,
  )
}

function pickerHtml(args: {
  host: HostBranding
  token: string
  tenantId: string
  verticals: readonly string[]
}): string {
  const items = args.verticals
    .map((v) => {
      // Root-relative hrefs — correct behind any host or proxy.
      const href =
        `/test/v1/auth/${escapeHtml(v)}/sandbox/connect` +
        `?tenant_id=${encodeURIComponent(args.tenantId)}&amp;link=${encodeURIComponent(args.token)}`
      return `<li><a href="${href}">Connect ${escapeHtml(v)} sandbox →</a></li>`
    })
    .join('\n')
  return page(
    args.host,
    'Connect an integration',
    `<h1>Connect an integration</h1>
<p>This is the sandbox's hosted mock connect page — the stand-in for the live
Connect Link picker. Choose a vertical to run the mock OAuth ceremony.</p>
<ul class="list">
${items}
</ul>`,
  )
}

function doneHtml(args: {
  host: HostBranding
  vertical: string | null
  connectionId: string | null
}): string {
  const detail = args.connectionId
    ? `<p>The ${escapeHtml(args.vertical!)} sandbox connection is ready:</p>
<p><code>${escapeHtml(args.connectionId)}</code></p>
<p>Use it as <code>connection_id</code> on any <code>/test/v1/${escapeHtml(args.vertical!)}/*</code> request.</p>`
    : `<p>The sandbox connection is ready. List your connections with
<code>GET /test/v1/connections</code> to pick one up.</p>`
  return page(
    args.host,
    'Connection complete',
    `<h1>You're connected ✓</h1>
${detail}`,
  )
}

function errorPageHtml(args: { host: HostBranding; title: string; body: string }): string {
  return page(
    args.host,
    args.title,
    `<h1>${escapeHtml(args.title)}</h1><p>${escapeHtml(args.body)}</p>`,
  )
}

// ── Router ──────────────────────────────────────────────────────────────────

export function createSandboxAuthRouter(opts: SandboxAuthRouterOptions): FastifyPluginAsync {
  const { verticals } = opts
  const getBranding = async (): Promise<HostBranding> => {
    try {
      return (await opts.getHostBranding?.()) ?? EMPTY_BRANDING
    } catch {
      return EMPTY_BRANDING
    }
  }

  // Pending OAuth state — same semantics as the live flow's in-memory map.
  const pending = new Map<string, PendingSandboxState>()
  const storeState = (record: Omit<PendingSandboxState, 'expiresAt'>): string => {
    const state = randomBytes(32).toString('hex')
    pending.set(state, { ...record, expiresAt: Date.now() + STATE_TTL_MS })
    return state
  }
  const peekState = (state: string): PendingSandboxState | null => {
    const rec = pending.get(state)
    if (!rec) return null
    if (rec.expiresAt < Date.now()) {
      pending.delete(state)
      return null
    }
    return rec
  }
  const consumeState = (state: string): PendingSandboxState | null => {
    const rec = peekState(state)
    if (rec) pending.delete(state)
    return rec
  }

  const sendHtml = (reply: FastifyReply, status: number, html: string) => {
    reply.header('content-security-policy', SANDBOX_PAGE_CSP)
    return reply.status(status).type('text/html; charset=utf-8').send(html)
  }
  const jsonError = (reply: FastifyReply, status: number, code: string, message: string) =>
    reply.status(status).send({ error: { code, message } })

  return async (fastify) => {
    fastify.addHook('onRequest', async (request, reply) => {
      if (opts.testModeEnabled && !opts.testModeEnabled()) {
        await reply.status(503).send({
          error: {
            code: 'TEST_MODE_DISABLED',
            message:
              'Test mode is disabled on this deployment. An operator set ' +
              'features.test_mode_enabled = false.',
          },
        })
        return reply
      }
      if (!opts.rateLimit) return
      const config = typeof opts.rateLimit === 'function' ? opts.rateLimit(request) : opts.rateLimit
      const rl = await consume(`sandbox-connect:${request.ip}`, config)
      if (rl.ok) return
      const retrySec = Math.ceil(rl.retryAfterMs / 1000)
      reply.header('retry-after', String(retrySec))
      // Browser-opened pages answer in kind (all routes here are GET).
      const host = await getBranding()
      return sendHtml(
        reply,
        429,
        errorPageHtml({
          host,
          title: 'Too many requests',
          body: `Please wait ${retrySec} seconds and try again.`,
        }),
      )
    })

    // ── Mock OAuth: connect ──────────────────────────────────────────────────
    fastify.get<{
      Params: { vertical: string; platform: string }
      Querystring: {
        tenant_id?: string
        label?: string
        link?: string
        outcome?: string
      }
    }>('/auth/:vertical/:platform/connect', async (request, reply) => {
      const { vertical, platform } = request.params
      // Mirror the live 404 for an adapter that isn't available — in the
      // sandbox, only the synthetic `sandbox` platform exists.
      if (platform !== 'sandbox' || !verticals.includes(vertical)) {
        return jsonError(
          reply,
          404,
          'ADAPTER_UNAVAILABLE',
          `Adapter '${vertical}:${platform}' is not enabled. The sandbox serves ` +
            `platform 'sandbox' for: ${verticals.join(', ')}.`,
        )
      }
      const tenantId = request.query.tenant_id
      if (!tenantId) {
        return jsonError(
          reply,
          400,
          'MISSING_PARAMS',
          "Query parameter 'tenant_id' is required — the sandbox ceremony " +
            'derives the connection id from it.',
        )
      }
      const outcome = request.query.outcome
      if (outcome !== undefined && !OUTCOMES.includes(outcome as Outcome)) {
        return jsonError(
          reply,
          400,
          'INVALID_OUTCOME',
          `outcome must be one of: ${OUTCOMES.join(', ')}.`,
        )
      }
      const linkToken = request.query.link ?? null
      if (linkToken && !decodeSandboxLinkToken(linkToken)) {
        return jsonError(reply, 400, 'INVALID_LINK_TOKEN', 'The link token is malformed.')
      }

      const callbackPath = `/test/v1/auth/${vertical}/sandbox/callback`
      if (outcome === 'expired') {
        // A state that was never stored — the callback answers INVALID_STATE,
        // which is exactly what an expired live state looks like.
        const ghost = randomBytes(32).toString('hex')
        return reply.redirect(`${callbackPath}?code=sbx_expired&state=${ghost}`)
      }
      const state = storeState({
        vertical,
        tenantId,
        label: request.query.label ?? null,
        linkToken,
      })
      if (outcome === 'granted') {
        return reply.redirect(`${callbackPath}?code=sbx_granted&state=${state}`)
      }
      if (outcome === 'denied') {
        return reply.redirect(`${callbackPath}?error=access_denied&state=${state}`)
      }
      if (outcome === 'error') {
        return reply.redirect(`${callbackPath}?error=server_error&state=${state}`)
      }
      // No outcome — the interactive journey through the mock authorize page.
      return reply.redirect(`/test/v1/auth/sandbox/authorize?state=${state}`)
    })

    // ── Mock authorize page (2 segments — no clash with the 3-segment routes) ─
    fastify.get<{ Querystring: { state?: string } }>(
      '/auth/sandbox/authorize',
      async (request, reply) => {
        const host = await getBranding()
        const state = request.query.state
        const rec = state ? peekState(state) : null
        if (!state || !rec) {
          return sendHtml(
            reply,
            400,
            errorPageHtml({
              host,
              title: 'Invalid or expired request',
              body: 'This authorize link is no longer valid — start the connect flow again.',
            }),
          )
        }
        return sendHtml(
          reply,
          200,
          authorizeHtml({
            host,
            vertical: rec.vertical,
            state,
            callbackPath: `/test/v1/auth/${rec.vertical}/sandbox/callback`,
          }),
        )
      },
    )

    // ── Mock OAuth: callback ─────────────────────────────────────────────────
    fastify.get<{
      Params: { vertical: string; platform: string }
      Querystring: { code?: string; state?: string; error?: string }
    }>('/auth/:vertical/:platform/callback', async (request, reply) => {
      const { vertical, platform } = request.params
      const { code, state, error } = request.query
      if (!state || (!code && !error)) {
        return jsonError(
          reply,
          400,
          'MISSING_PARAMS',
          "Query parameters 'state' and one of 'code' or 'error' are required.",
        )
      }
      const rec = consumeState(state)
      if (!rec) {
        return jsonError(
          reply,
          400,
          'INVALID_STATE',
          'Unknown, expired, or already-used state — start the connect flow again.',
        )
      }
      if (rec.vertical !== vertical || platform !== 'sandbox') {
        return jsonError(
          reply,
          400,
          'STATE_MISMATCH',
          `This state belongs to '${rec.vertical}:sandbox', not '${vertical}:${platform}'.`,
        )
      }
      if (error) {
        const denied = error === 'access_denied'
        const status = 400
        if (rec.linkToken) {
          const host = await getBranding()
          return sendHtml(
            reply,
            status,
            errorPageHtml({
              host,
              title: denied ? 'Access denied' : 'Provider error',
              body: denied
                ? 'The (mock) authorization was declined. No connection was created.'
                : 'The (mock) provider reported an error. No connection was created.',
            }),
          )
        }
        return jsonError(
          reply,
          status,
          denied ? 'OAUTH_ACCESS_DENIED' : 'OAUTH_PROVIDER_ERROR',
          denied
            ? 'The (mock) authorization was declined. No connection was created.'
            : 'The (mock) provider reported an error. No connection was created.',
        )
      }
      // Success — the ONLY id the sandbox can grant is the derived one.
      const id = sandboxConnectionId(rec.tenantId, vertical)
      if (rec.linkToken) {
        return reply.redirect(
          `/test/v1/connect/${rec.linkToken}/done?vertical=${encodeURIComponent(vertical)}`,
        )
      }
      return reply.status(201).send({
        data: {
          id,
          vertical,
          platform: 'sandbox',
          tenantId: rec.tenantId,
          label: rec.label ?? `${vertical} sandbox`,
          status: 'connected',
        },
      })
    })

    // ── Hosted mock connect pages ────────────────────────────────────────────
    fastify.get<{ Params: { token: string } }>('/connect/:token', async (request, reply) => {
      const host = await getBranding()
      const decoded = decodeSandboxLinkToken(request.params.token)
      if (!decoded) {
        return sendHtml(
          reply,
          404,
          errorPageHtml({
            host,
            title: 'Link not found',
            body: 'This sandbox connect link is invalid. Mint a new one with POST /test/v1/customers/{id}/connect-links.',
          }),
        )
      }
      return sendHtml(
        reply,
        200,
        pickerHtml({
          host,
          token: request.params.token,
          tenantId: decoded.tenantId,
          verticals,
        }),
      )
    })

    fastify.get<{ Params: { token: string }; Querystring: { vertical?: string } }>(
      '/connect/:token/done',
      async (request, reply) => {
        const host = await getBranding()
        const decoded = decodeSandboxLinkToken(request.params.token)
        if (!decoded) {
          return sendHtml(
            reply,
            404,
            errorPageHtml({
              host,
              title: 'Link not found',
              body: 'This sandbox connect link is invalid.',
            }),
          )
        }
        const vertical =
          request.query.vertical && verticals.includes(request.query.vertical)
            ? request.query.vertical
            : null
        return sendHtml(
          reply,
          200,
          doneHtml({
            host,
            vertical,
            connectionId: vertical ? sandboxConnectionId(decoded.tenantId, vertical) : null,
          }),
        )
      },
    )
  }
}
