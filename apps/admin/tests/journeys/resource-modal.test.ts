/**
 * Opening a connection without leaving the list.
 *
 * Resource detail pages open as modals, built as progressive enhancement, not
 * replacement: the detail route keeps rendering
 * a full page and stays the source of truth, and a shared script upgrades a link
 * marked `data-modal` into a dialog. Everything below is the server-rendered
 * half of that contract — the half a journey test can actually reach.
 *
 * What these tests CANNOT cover: the dialog itself. Whether `showModal()` runs,
 * whether focus lands inside and returns to the link, whether Escape and Back
 * close it, whether the URL is pushed and restored — none of that exists without
 * a browser. They pin only what the script depends on being true of the HTML,
 * and the fact that removing JS from the picture leaves a working page.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockListConnectionsPaged = vi.fn()
const mockGetConnection = vi.fn()
const mockCreateSyncJob = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listConnectionsPaged: mockListConnectionsPaged,
      getConnection: mockGetConnection,
      createSyncJob: mockCreateSyncJob,
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      getCompanyInfo: async () => {
        return null
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'resource-modal-session-secret-long-enough'
const CONNECTION = {
  id: '9f8e7d6c-1111-4a2b-8c3d-000000000001',
  vertical: 'accounting',
  platform: 'fortnox',
  label: 'Acme Books',
  status: 'valid',
  createdAt: '2026-01-15T09:30:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
}
const DETAIL_URL = `/connections/${CONNECTION.vertical}/${CONNECTION.id}`

let fastify: FastifyInstance

function session(role: 'viewer' | 'operator' | 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function csrf(c: string) {
  return createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}

beforeEach(async () => {
  mockListConnectionsPaged.mockReset()
  mockGetConnection.mockReset()
  mockCreateSyncJob.mockReset()
  mockListConnectionsPaged.mockResolvedValue({
    data: [CONNECTION],
    meta: { page: 1, limit: 50, total: 1 },
  })
  mockGetConnection.mockResolvedValue(CONNECTION)
  mockCreateSyncJob.mockResolvedValue({ id: 'job_1' })
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

describe('Journey: an operator opens a connection from the list', () => {
  it('marks the row link for the modal without taking its href away', async () => {
    const res = await get('/connections')
    expect(res.statusCode).toBe(200)
    // Both halves matter: `data-modal` is what the script looks for, and the
    // href is what happens when the script is not there.
    expect(res.body).toContain(`href="${DETAIL_URL}"`)
    expect(res.body).toMatch(new RegExp(`<a[^>]*href="${DETAIL_URL}"[^>]*\\sdata-modal(\\s|=|>)`))
  })

  it('ships the modal script and its dialog on every signed-in page', async () => {
    const res = await get('/connections')
    expect(res.body).toContain('/public/js/resource-modal.js')
    expect(res.body).toContain('data-resource-modal')
  })

  it('actually serves the script it links to', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/public/js/resource-modal.js' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-modal')
  })

  it('names the dialog from the heading with aria-hidden decoration left out', async () => {
    // textContent does not honour aria-hidden, so a decorative monogram or
    // icon inside a detail page's <h1> would otherwise be read aloud as part
    // of the dialog's name. Without a DOM here, pin the discipline in the
    // source: the copy the name is read from has those nodes removed first.
    const res = await fastify.inject({ method: 'GET', url: '/public/js/resource-modal.js' })
    expect(res.body).toContain('[aria-hidden="true"]')
    expect(res.body).toMatch(/aria-hidden[\s\S]*?\.remove\(\)[\s\S]*?textContent/)
  })

  it('leaves the dialog empty until the script fills it, so no-JS shows nothing', async () => {
    const res = await get('/connections')
    // The dialog is inert markup on a no-JS page: a <dialog> without `open`
    // does not render. Guard against someone giving it default content.
    expect(res.body).toMatch(/<dialog[^>]*data-resource-modal(?![^>]*\bopen\b)/)
  })
})

describe('Journey: the detail page is still a page', () => {
  it('renders a full document, not a fragment', async () => {
    const res = await get(DETAIL_URL)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<!DOCTYPE html>')
    // The chrome — a deep link, a bookmark or "open in new tab" lands here and
    // must arrive at a navigable page, not a bare card.
    expect(res.body).toContain('class="sidebar__link"')
  })

  it('keeps the detail content inside the region the script extracts', async () => {
    const res = await get(DETAIL_URL)
    // The script pulls `main.app-content` out of the fetched page. If the shell
    // stops using it the modal silently falls back to navigating.
    expect(res.body).toContain('<main class="app-content">')
    const main = res.body.slice(res.body.indexOf('<main class="app-content">'))
    expect(main).toContain(CONNECTION.id)
  })

  it('serves the same page to a plain no-JS request', async () => {
    // No Accept negotiation, no custom header — what a browser with scripting
    // off sends. The route must not have grown a fragment-only branch.
    const res = await fastify.inject({
      method: 'GET',
      url: DETAIL_URL,
      headers: { accept: 'text/html' },
      cookies: { session: session('admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<!DOCTYPE html>')
    expect(res.headers['content-type']).toContain('text/html')
  })
})

describe('Journey: the modal changes nothing about who may see what', () => {
  it('still lets a viewer read the detail page', async () => {
    const res = await get(DETAIL_URL, 'viewer')
    expect(res.statusCode).toBe(200)
  })

  it('still sends an unauthenticated visitor to the login page', async () => {
    const res = await fastify.inject({ method: 'GET', url: DETAIL_URL })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/login')
  })

  it('still refuses a viewer the sync it never had', async () => {
    const c = session('viewer')
    const res = await fastify.inject({
      method: 'POST',
      url: `${DETAIL_URL}/sync`,
      cookies: { session: c },
      payload: { _csrf: csrf(c) },
    })
    expect(res.statusCode).toBe(403)
    expect(mockCreateSyncJob).not.toHaveBeenCalled()
  })
})
