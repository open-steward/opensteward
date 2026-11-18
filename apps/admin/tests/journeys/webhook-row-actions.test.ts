/**
 * Webhooks list — the row-actions disclosure and the URL column's width fix.
 *
 * Pause, rotate-secret, delete and send-test used to render as four
 * always-visible POST forms per row, each stacking underneath the last and
 * pushing every row's height out. They now render behind one `<details>`
 * labelled "Actions" (see `.row-actions` in public/css/style.css and the
 * actions cell in views/webhooks/index.ejs) — same forms, same `_csrf`,
 * just collapsed by default. This file is the guard that a later edit
 * cannot silently drop an action, mislabel the control, or leak a write
 * action to a role that should not have it: `no-interpolation-in-inline-js`
 * and `table-filter-form-placement` police markup *shape* repo-wide, but
 * neither one reads this page's actual rendered content.
 *
 * Also covers the URL cell still carrying `.webhooks-url` — the class the
 * companion CSS fix (public/css/style.css) depends on existing at all.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockListWebhookSubs = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listWebhookSubs: mockListWebhookSubs,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'webhook-row-actions-secret-long-enough-xx'
let fastify: FastifyInstance

function cookie(role: 'admin' | 'operator'): string {
  return fastify.signCookie(
    JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }),
  )
}

const get = (role: 'admin' | 'operator') =>
  fastify.inject({ method: 'GET', url: '/webhooks', cookies: { session: cookie(role) } })

const SUB = {
  id: 'wh-1',
  label: 'Prod hook',
  tenantId: 'default',
  paused: false,
  url: 'https://hooks.example.com/opensteward/inbound',
  events: ['*'],
  format: 'opensteward',
  headerNames: [],
  lastFiredAt: null,
  lastStatus: null,
  lastError: null,
  createdAt: '2026-09-01T00:00:00.000Z',
}

beforeEach(async () => {
  mockListWebhookSubs.mockReset().mockResolvedValue([SUB])
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

describe('Webhooks list: row actions collapsed into one labelled control', () => {
  it('renders the collapsed control labelled "Actions"', async () => {
    const res = await get('admin')
    expect(res.statusCode).toBe(200)
    // Fails if the control is renamed, the <summary> text is changed to
    // something else ("Menu", "More", an icon-only glyph), or the
    // disclosure is dropped in favor of markup with no "Actions" label at
    // all — any of which stops matching this element.
    expect(res.body).toMatch(/<details class="row-actions">\s*<summary[^>]*>Actions<\/summary>/)
  })

  it('keeps every previously-available admin action present in the DOM', async () => {
    const res = await get('admin')
    // Each of these was a distinct always-visible <button>/<a> before this
    // change. Fails if any one is deleted outright while collapsing the
    // rest — the operator asked to shrink the row, not to lose an action.
    expect(res.body).toContain('/webhooks/wh-1/deliveries')
    expect(res.body).toContain('>Pause<')
    expect(res.body).toContain('/webhooks/wh-1/rotate-secret')
    expect(res.body).toContain('Rotate secret')
    expect(res.body).toContain('/webhooks/wh-1/delete')
    expect(res.body).toContain('>Delete<')
    expect(res.body).toContain('/webhooks/wh-1/test')
    expect(res.body).toContain('Send test')
    expect(res.body).toContain('/webhooks/wh-1/settings')
    expect(res.body).toContain('Delivery settings')
  })

  it('shows Resume, not Pause, once the subscription is paused', async () => {
    // Guards that collapsing the markup did not also collapse the
    // paused/unpaused label logic (`s.paused ? 'Resume' : 'Pause'`) into
    // something that always reads one way regardless of state.
    mockListWebhookSubs.mockResolvedValue([{ ...SUB, paused: true }])
    const res = await get('admin')
    expect(res.body).toContain('>Resume<')
    expect(res.body).not.toContain('>Pause<')
  })

  it('carries a working _csrf token on every action form, not just the first', async () => {
    const res = await get('admin')
    const forms = [...res.body.matchAll(/<form method="POST" action="\/webhooks\/wh-1\/(pause|rotate-secret|delete|test)"[\s\S]*?<\/form>/g)]
    // Fails if collapsing the forms into the <details> menu dropped one, or
    // if a refactor hoisted a single shared _csrf outside the per-form
    // hidden input instead of keeping one per form.
    expect(forms.length).toBe(4)
    for (const f of forms) {
      expect(f[0], f[0]).toMatch(/name="_csrf" value="[0-9a-f]{32}"/)
    }
  })

  it('does not show admin-only write actions to an operator', async () => {
    const res = await get('operator')
    expect(res.statusCode).toBe(200)
    // Fails if the isAdmin gate around the <details> ever regresses (e.g. a
    // future edit hoists one of these forms out from under `isAdmin`) —
    // an operator would then get a working Delete/rotate-secret button.
    expect(res.body).not.toContain('row-actions')
    expect(res.body).not.toContain('Rotate secret')
    expect(res.body).not.toContain('/webhooks/wh-1/delete')
    expect(res.body).not.toContain('/webhooks/wh-1/rotate-secret')
    expect(res.body).not.toContain('/webhooks/wh-1/pause')
    expect(res.body).not.toContain('/webhooks/wh-1/test')
    expect(res.body).not.toContain('Delivery settings')
    // The one action every viewer of the list keeps regardless of role.
    expect(res.body).toContain('/webhooks/wh-1/deliveries')
  })
})

describe('Webhooks list: URL column still wraps instead of clipping', () => {
  it('carries the wrapping class on the URL cell', async () => {
    const res = await get('admin')
    // Fails if a future edit drops the class from the cell (reverting to
    // the old silently-clipped ellipsis, or removing the rule's hook
    // entirely) — this is the one thing the CSS fix in style.css depends on
    // existing in the markup at all.
    expect(res.body).toMatch(/<td class="mono webhooks-url"[^>]*>/)
  })

  it('still renders the full URL text, not a truncated form of it', async () => {
    const res = await get('admin')
    expect(res.body).toContain(SUB.url)
  })
})
