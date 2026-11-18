/**
 * Notifications live behind a bell in the header, not a sidebar entry.
 *
 * The bell carries a server-rendered unread count, so the number an operator
 * sees is the same one every other page in the deployment shows — no
 * client-side fetch, nothing for a slow admin-api to leave blank. The count
 * is best-effort by design: an outage must cost the badge, never the page.
 *
 * The number is admin-api's: `GET /api/notifications/unread-count` counts in
 * SQL and answers exactly, with `credential_expiring` left out. The poller
 * re-raises that one every five minutes for as long as a token is inside its
 * refresh window, and a token in that window refreshes itself — a count that
 * includes it is never zero, and a badge that is never zero says nothing. The
 * exclusion is admin-api's to test; here the bell shows what it is told.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetUnreadNotificationCount = vi.fn()
const mockListNotifications = vi.fn()
const mockAcknowledgeNotification = vi.fn()
const mockAcknowledgeAll = vi.fn()
const mockGetCompanyInfo = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getUnreadNotificationCount: mockGetUnreadNotificationCount,
      listNotifications: mockListNotifications,
      acknowledgeNotification: mockAcknowledgeNotification,
      acknowledgeAll: mockAcknowledgeAll,
      getCompanyInfo: mockGetCompanyInfo,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { flashOf } = await import('../helpers/flash')

const SESSION_SECRET = 'header-bell-session-secret-long-enough'
let fastify: FastifyInstance

type Role = 'viewer' | 'operator' | 'admin'

function session(role: Role) {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }))
}
function csrf(cookie: string) {
  return createHmac('sha256', SESSION_SECRET).update(cookie).digest('hex').slice(0, 32)
}
function get(url: string, role: Role = 'operator') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(url: string, role: Role = 'operator') {
  const c = session(role)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf: csrf(c) },
  })
}

/** The bell element, or null when the page has none. */
function bellOf(body: string): string | null {
  const m = /<a[^>]*class="[^"]*header-bell[^"]*"[^>]*>[\s\S]*?<\/a>/.exec(body)
  return m ? m[0] : null
}
/** Everything inside the sidebar landmark. */
function sidebarOf(body: string): string {
  const m = /<aside class="sidebar">[\s\S]*?<\/aside>/.exec(body)
  return m ? m[0] : ''
}

function notification(id: number, type: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type,
    vertical: 'accounting',
    connectionId: null,
    platform: 'xero',
    message: `notification ${id} (${type})`,
    acknowledged: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...extra,
  }
}

beforeEach(async () => {
  mockGetUnreadNotificationCount.mockReset()
  mockListNotifications.mockReset()
  mockAcknowledgeNotification.mockReset()
  mockAcknowledgeAll.mockReset()
  mockGetCompanyInfo.mockReset()
  mockGetUnreadNotificationCount.mockResolvedValue(0)
  mockListNotifications.mockResolvedValue([])
  mockGetCompanyInfo.mockResolvedValue(null)
  mockAcknowledgeNotification.mockResolvedValue(undefined)
  mockAcknowledgeAll.mockResolvedValue(undefined)
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

describe('Journey: the header bell carries the unread count', () => {
  it('renders the count on every signed-in page', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(3)
    for (const url of ['/', '/connections', '/sync-jobs']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(200)
      const bell = bellOf(res.body)
      expect(bell, `${url} has no bell`).not.toBeNull()
      expect(bell).toContain('href="/notifications"')
      expect(bell).toContain('aria-label="Notifications, 3 unread"')
      expect(bell).toContain('class="ph ph-bell"')
      // The number is decoration for sighted users; AT gets it from the label.
      expect(bell).toMatch(/<span class="header-bell__count" aria-hidden="true">3<\/span>/)
    }
  })

  it('asks admin-api for the count, never for the list', async () => {
    // The number comes from GET /api/notifications/unread-count, exact and
    // with the exclusion done in SQL, so no page but /notifications has any
    // use for the rows — and paying for a 50-row page to count it here would
    // be the waste this endpoint was added to end.
    mockGetUnreadNotificationCount.mockResolvedValue(3)
    const res = await get('/')
    expect(res.statusCode).toBe(200)
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledTimes(1)
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledWith('jwt')
    expect(mockListNotifications).not.toHaveBeenCalled()
  })

  it('shows no badge at zero', async () => {
    const res = await get('/')
    const bell = bellOf(res.body)
    expect(bell).not.toBeNull()
    expect(bell).toContain('aria-label="Notifications, 0 unread"')
    expect(bell).not.toContain('header-bell__count')
  })

  it('shows the exact count', async () => {
    // admin-api counts in SQL, so the number is the number: 73 unread reads
    // "73", not a floor taken off a 50-row page.
    for (const count of [1, 50, 73, 99]) {
      mockGetUnreadNotificationCount.mockResolvedValue(count)
      const bell = bellOf((await get('/')).body)
      expect(bell, String(count)).toContain(`aria-label="Notifications, ${count} unread"`)
      expect(bell, String(count)).toContain(`>${count}</span>`)
    }
  })

  it('caps the badge at 99+', async () => {
    // Past two digits the badge stops being a number and becomes "many": a
    // deployment with 1,204 unread needs the page, not a wider badge. The
    // label says the same, so AT and sighted users hear one thing.
    for (const count of [100, 1204]) {
      mockGetUnreadNotificationCount.mockResolvedValue(count)
      const bell = bellOf((await get('/')).body)
      expect(bell, String(count)).toContain('aria-label="Notifications, 99+ unread"')
      expect(bell, String(count)).toContain('>99+</span>')
    }
  })

  it('keeps the bell, drops the count, and still serves the page when admin-api is down', async () => {
    mockGetUnreadNotificationCount.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const res = await get('/')
    expect(res.statusCode).toBe(200)
    const bell = bellOf(res.body)
    expect(bell).not.toBeNull()
    expect(bell).toContain('href="/notifications"')
    // Unknown is not zero: no "0 unread" claim, and no badge.
    expect(bell).toContain('aria-label="Notifications"')
    expect(bell).not.toContain('unread')
    expect(bell).not.toContain('header-bell__count')
  })

  it('marks the bell current on the notifications page and nowhere else', async () => {
    expect(bellOf((await get('/notifications')).body)).toContain('aria-current="page"')
    expect(bellOf((await get('/')).body)).not.toContain('aria-current')
  })

  it('asks for the count only on a signed-in GET', async () => {
    // A POST renders nothing, and the signed-out shell has no header.
    await post('/notifications/1/acknowledge')
    expect(mockGetUnreadNotificationCount).not.toHaveBeenCalled()
    const login = await fastify.inject({ method: 'GET', url: '/login' })
    expect(login.statusCode).toBe(200)
    expect(mockGetUnreadNotificationCount).not.toHaveBeenCalled()
    expect(mockListNotifications).not.toHaveBeenCalled()
    expect(bellOf(login.body)).toBeNull()
  })

  it('does not ask for the count on fragments and JSON that never draw the header', async () => {
    for (const url of [
      '/data/platforms/platforms.json',
      '/platforms/logos/panel',
      '/setup/wizard/logos/panel',
      '/setup/wizard/logos/status',
    ]) {
      mockGetUnreadNotificationCount.mockClear()
      const res = await get(url, 'admin')
      expect(res.statusCode, url).not.toBe(500)
      expect(mockGetUnreadNotificationCount, url).not.toHaveBeenCalled()
    }
    // The company-info read shares the exemption list. (The wizard's own
    // progress hook still asks for company info on its fragments — that is
    // the wizard plugin's, not the shell's, and out of scope here.)
    for (const url of ['/data/platforms/platforms.json', '/platforms/logos/panel']) {
      mockGetCompanyInfo.mockClear()
      await get(url, 'admin')
      expect(mockGetCompanyInfo, url).not.toHaveBeenCalled()
    }
    // The wizard's logo step itself is a page, and gets both.
    mockGetUnreadNotificationCount.mockClear()
    mockGetCompanyInfo.mockClear()
    const page = await get('/setup/wizard/logos', 'admin')
    expect(page.statusCode).toBe(200)
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledTimes(1)
    expect(mockGetCompanyInfo).toHaveBeenCalled()
  })

  it('asks for the count once and the list once on the notifications page', async () => {
    // The bell needs the number and the page needs the rows: one round-trip
    // each, neither made twice.
    mockGetUnreadNotificationCount.mockResolvedValue(1)
    mockListNotifications.mockResolvedValue([
      notification(1, 'credential_expired', { connectionId: 'conn-1' }),
    ])
    const res = await get('/notifications')
    expect(res.statusCode).toBe(200)
    expect(mockGetUnreadNotificationCount).toHaveBeenCalledTimes(1)
    expect(mockListNotifications).toHaveBeenCalledTimes(1)
    expect(bellOf(res.body)).toContain('aria-label="Notifications, 1 unread"')
    expect(res.body).toContain('notification 1 (credential_expired)')
  })

  it('still lists notifications when only the count is unavailable', async () => {
    // The page fetches its own rows; the bell's failure is the bell's alone.
    mockGetUnreadNotificationCount.mockRejectedValue(new Error('connect ECONNREFUSED'))
    mockListNotifications.mockResolvedValue([notification(1, 'credential_expired')])
    const res = await get('/notifications')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('notification 1 (credential_expired)')
    expect(bellOf(res.body)).toContain('aria-label="Notifications"')
    expect(bellOf(res.body)).not.toContain('unread')
  })
})

describe('Journey: the sidebar no longer lists Notifications', () => {
  it('links to /notifications from the header only', async () => {
    const body = (await get('/', 'admin')).body
    const sidebar = sidebarOf(body)
    expect(sidebar.length).toBeGreaterThan(0)
    expect(sidebar).not.toContain('/notifications')
    expect(sidebar).not.toContain('Notifications')
    expect(bellOf(body)).not.toBeNull()
  })
})

describe('Journey: the notifications page by role', () => {
  const ROWS = [
    notification(1, 'credential_expired', { connectionId: 'conn-1' }),
    notification(2, 'platform_credentials_invalid'),
    notification(3, 'vertical_down', { vertical: 'crm', platform: null }),
  ]

  it('shows a viewer no Dismiss buttons', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    const res = await get('/notifications', 'viewer')
    expect(res.statusCode).toBe(200)
    // The button text, not the word: the toast layer's close control in the
    // layout is labelled "Dismiss" on every page.
    expect(res.body).not.toContain('>Dismiss</button>')
    expect(res.body).not.toContain('Dismiss all')
    expect(res.body).not.toContain('/acknowledge')
    // Still the whole list — a viewer reads everything.
    expect(res.body).toContain('notification 1 (credential_expired)')
    expect(res.body).toContain('notification 3 (vertical_down)')
  })

  it('shows an operator Dismiss and Dismiss all', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    const body = (await get('/notifications', 'operator')).body
    expect(body).toContain('action="/notifications/1/acknowledge"')
    expect(body).toContain('action="/notifications/acknowledge-all"')
    expect(body).toContain('Dismiss all')
  })

  it('links each notification to the thing it is about', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    const body = (await get('/notifications', 'admin')).body
    // A connection has a modal; the link opens in the shared dialog.
    expect(body).toMatch(/<a[^>]*href="\/connections\/accounting\/conn-1"[^>]*data-modal/)
    // The platform page has no modal and is admin-only.
    expect(body).toContain('href="/platforms/accounting/xero"')
    expect(body).not.toMatch(/<a[^>]*href="\/platforms\/accounting\/xero"[^>]*data-modal/)
  })

  it('names each Open and Dismiss after its notification', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    const body = (await get('/notifications', 'operator')).body
    // The message carries the id the controls point at, so a screen reader's
    // controls list reads "Open, notification 1 (credential_expired)" rather
    // than "Open, Open, Open".
    expect(body).toContain('id="notification-1"')
    expect(body).toMatch(
      /<a[^>]*id="open-1"[^>]*aria-labelledby="open-1 notification-1"[^>]*href="\/connections\/accounting\/conn-1"/,
    )
    expect(body).toMatch(
      /<button[^>]*id="dismiss-1"[^>]*aria-labelledby="dismiss-1 notification-1"/,
    )
    expect(body).toMatch(
      /<button[^>]*id="dismiss-3"[^>]*aria-labelledby="dismiss-3 notification-3"/,
    )
  })

  it('explains why the page lists more than the bell counts', async () => {
    // The bell's number is admin-api's count, which leaves credential_expiring
    // out; the page lists every row and says how many the bell is not counting.
    mockGetUnreadNotificationCount.mockResolvedValue(3)
    mockListNotifications.mockResolvedValue([...ROWS, notification(4, 'credential_expiring')])
    const res = await get('/notifications', 'operator')
    expect(bellOf(res.body)).toContain('aria-label="Notifications, 3 unread"')
    expect(res.body).toContain('4 active')
    expect(res.body).toContain('1 expiring soon, not counted on the bell')

    mockListNotifications.mockResolvedValue(ROWS)
    const plain = (await get('/notifications', 'operator')).body
    expect(plain).toContain('3 active')
    expect(plain).not.toContain('not counted on the bell')
  })

  it('tells a viewer or operator that rejected platform credentials need an admin', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    for (const role of ['viewer', 'operator'] as const) {
      const body = (await get('/notifications', role)).body
      expect(body, role).toContain('Needs an admin to update the platform credentials.')
    }
    // An admin gets the Open link instead.
    const admin = (await get('/notifications', 'admin')).body
    expect(admin).not.toContain('Needs an admin to update the platform credentials.')
    expect(admin).toContain('href="/platforms/accounting/xero"')
  })

  it('does not offer a viewer or operator the admin-only platform page', async () => {
    mockListNotifications.mockResolvedValue(ROWS)
    for (const role of ['viewer', 'operator'] as const) {
      const body = (await get('/notifications', role)).body
      expect(body, role).not.toContain('/platforms/accounting/xero')
      // The connection link is readable by everyone.
      expect(body, role).toContain('href="/connections/accounting/conn-1"')
    }
  })
})

describe('Journey: dismissing reports back on the notifications page', () => {
  it('dismisses one and returns to the list with a flash', async () => {
    const res = await post('/notifications/7/acknowledge')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/notifications')
    expect(mockAcknowledgeNotification).toHaveBeenCalledWith('jwt', 7)
    expect(flashOf(fastify, res)).toEqual([{ tone: 'success', body: expect.any(String) }])
  })

  it('dismisses all and returns to the list with a flash', async () => {
    const res = await post('/notifications/acknowledge-all')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/notifications')
    expect(mockAcknowledgeAll).toHaveBeenCalledWith('jwt')
    expect(flashOf(fastify, res)).toEqual([{ tone: 'success', body: expect.any(String) }])
  })

  it('refuses a viewer without asking admin-api', async () => {
    expect((await post('/notifications/7/acknowledge', 'viewer')).statusCode).toBe(403)
    expect((await post('/notifications/acknowledge-all', 'viewer')).statusCode).toBe(403)
    expect(mockAcknowledgeNotification).not.toHaveBeenCalled()
    expect(mockAcknowledgeAll).not.toHaveBeenCalled()
  })
})
