import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminApiClient } from '../../../src/core/proxy/admin-api-client'

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })),
  },
}))

import axios from 'axios'

function getClientInstance() {
  return vi.mocked(axios.create).mock.results[0]?.value
}

describe('AdminApiClient', () => {
  let client: AdminApiClient
  let mockAxios: any

  beforeEach(() => {
    vi.clearAllMocks()
    client = new AdminApiClient('http://localhost:3001')
    mockAxios = getClientInstance()
  })

  describe('login', () => {
    it('sends POST to /api/auth/login and returns token', async () => {
      const response = { token: 'jwt-123', user: { id: '1', username: 'admin', role: 'admin' } }
      mockAxios.post.mockResolvedValue({ data: response })

      const result = await client.login('admin', 'pass')
      expect(result.token).toBe('jwt-123')
      expect(result.user.username).toBe('admin')
      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/login', { username: 'admin', password: 'pass' })
    })
  })

  describe('setup', () => {
    it('sends POST to /api/auth/setup', async () => {
      const response = { token: 'jwt-456', user: { id: '1', username: 'admin', role: 'admin' } }
      mockAxios.post.mockResolvedValue({ data: response })

      const result = await client.setup('admin', 'pass')
      expect(result.token).toBe('jwt-456')
      // No bootstrap token → no per-request config (undefined third arg).
      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/setup', { username: 'admin', password: 'pass' }, undefined)
    })

    it('forwards the bootstrap token as the X-Bootstrap-Token header when given', async () => {
      mockAxios.post.mockResolvedValue({ data: { token: 't', user: { id: '1', username: 'a', role: 'admin' } } })
      await client.setup('admin', 'pass', 'my-bootstrap-token')
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/auth/setup',
        { username: 'admin', password: 'pass' },
        { headers: { 'X-Bootstrap-Token': 'my-bootstrap-token' } },
      )
    })
  })

  describe('me', () => {
    it('sends GET to /api/auth/me with Bearer token', async () => {
      mockAxios.get.mockResolvedValue({ data: { user: { id: '1', username: 'admin', role: 'admin' } } })

      const user = await client.me('my-token')
      expect(user.username).toBe('admin')
      expect(mockAxios.get).toHaveBeenCalledWith('/api/auth/me', {
        headers: { Authorization: 'Bearer my-token' },
      })
    })
  })

  describe('getVerticals', () => {
    it('returns vertical status array', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ name: 'accounting', status: 'up', adapterCount: 5 }] },
      })

      const verticals = await client.getVerticals('token')
      expect(verticals).toHaveLength(1)
      expect(verticals[0].name).toBe('accounting')
    })
  })

  describe('listConnections', () => {
    it('returns tagged connections', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ id: 'c-1', platform: 'fortnox', status: 'valid', vertical: 'accounting' }] },
      })

      const conns = await client.listConnections('token')
      expect(conns).toHaveLength(1)
      expect(conns[0].vertical).toBe('accounting')
    })

    it('passes filter params', async () => {
      mockAxios.get.mockResolvedValue({ data: { data: [] } })

      await client.listConnections('token', { vertical: 'logistics', status: 'expired' })
      expect(mockAxios.get).toHaveBeenCalledWith('/api/connections', {
        headers: { Authorization: 'Bearer token' },
        params: { vertical: 'logistics', status: 'expired' },
      })
    })
  })

  describe('getConnection', () => {
    it('returns connection on success', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: { id: 'c-1', platform: 'fortnox', vertical: 'accounting' } },
      })

      const conn = await client.getConnection('token', 'accounting', 'c-1')
      expect(conn).not.toBeNull()
      expect(conn!.id).toBe('c-1')
    })

    it('returns null on 404', async () => {
      mockAxios.get.mockRejectedValue({ response: { status: 404 } })

      const conn = await client.getConnection('token', 'accounting', 'bad-id')
      expect(conn).toBeNull()
    })
  })

  describe('deleteConnection', () => {
    it('resolves on success', async () => {
      mockAxios.delete.mockResolvedValue({ status: 204 })

      await expect(client.deleteConnection('token', 'accounting', 'c-1')).resolves.toBeUndefined()
      expect(mockAxios.delete).toHaveBeenCalledWith('/api/connections/accounting/c-1', {
        headers: { Authorization: 'Bearer token' },
      })
    })

    // Was `returns false on error`. Nothing read that boolean — every caller
    // awaited and redirected — so a refused delete rendered as a completed one.
    // See tests/unit/proxy/upstream-failure-is-not-absence.test.ts.
    it('throws on error instead of reporting a silent no-op', async () => {
      mockAxios.delete.mockRejectedValue({ response: { status: 404 } })

      await expect(client.deleteConnection('token', 'accounting', 'bad-id')).rejects.toBeDefined()
    })
  })

  describe('listPlatforms', () => {
    it('returns tagged providers', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ slug: 'fortnox', name: 'Fortnox', vertical: 'accounting' }] },
      })

      const providers = await client.listPlatforms('token')
      expect(providers).toHaveLength(1)
      expect(providers[0].slug).toBe('fortnox')
    })
  })

  describe('listNotifications', () => {
    it('returns notifications array', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ id: 1, type: 'alert', message: 'test' }] },
      })

      const notifs = await client.listNotifications('token')
      expect(notifs).toHaveLength(1)
    })
  })

  describe('getUnreadNotificationCount', () => {
    it('sends GET to /api/notifications/unread-count and unwraps data.count', async () => {
      mockAxios.get.mockResolvedValue({ data: { data: { count: 3 } } })

      expect(await client.getUnreadNotificationCount('token')).toBe(3)
      expect(mockAxios.get).toHaveBeenCalledWith('/api/notifications/unread-count', {
        headers: { Authorization: 'Bearer token' },
      })
    })
  })

  describe('dashboard tasks', () => {
    it('lists the clears, createdAt as the ISO string admin-api serialises', async () => {
      const row = {
        key: 'conn:expired:c1',
        fingerprint: '2026-09-01T00:00:00.000Z',
        by: 'u1',
        createdAt: '2026-09-05T13:25:52.531Z',
      }
      mockAxios.get.mockResolvedValue({ data: { data: [row] } })

      expect(await client.listDashboardDismissals('token')).toEqual([row])
      expect(mockAxios.get).toHaveBeenCalledWith('/api/dashboard-tasks/dismissals', {
        headers: { Authorization: 'Bearer token' },
      })
    })

    it('posts the batch as { items } to /api/dashboard-tasks/dismissals', async () => {
      mockAxios.post.mockResolvedValue({ status: 204 })
      const items = [{ key: 'conn:expired:c1', fingerprint: '2026-09-01T00:00:00.000Z' }]

      await client.dismissDashboardTasks('token', items)
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/dashboard-tasks/dismissals',
        { items },
        { headers: { Authorization: 'Bearer token' } },
      )
    })

    it('deletes one clear by its URL-encoded key', async () => {
      mockAxios.delete.mockResolvedValue({ status: 204 })

      await client.undismissDashboardTask('token', 'platform:creds:accounting/xero')
      expect(mockAxios.delete).toHaveBeenCalledWith(
        '/api/dashboard-tasks/dismissals/platform%3Acreds%3Aaccounting%2Fxero',
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('acknowledgeNotification', () => {
    it('sends POST to acknowledge endpoint', async () => {
      mockAxios.post.mockResolvedValue({ status: 204 })

      await client.acknowledgeNotification('token', 42)
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/notifications/42/acknowledge',
        {},
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('listAudit', () => {
    it('returns audit entries with pagination', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ id: 1, action: 'user.login' }], meta: { page: 1, limit: 50 } },
      })

      const result = await client.listAudit('token', 1, 50)
      expect(result.data).toHaveLength(1)
      expect(result.meta.page).toBe(1)
    })
  })

  describe('listUsers', () => {
    it('returns user list', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ id: '1', username: 'admin', role: 'admin' }] },
      })

      const users = await client.listUsers('token')
      expect(users).toHaveLength(1)
    })
  })

  describe('createUser', () => {
    it('sends POST to create user', async () => {
      mockAxios.post.mockResolvedValue({
        data: { data: { id: '2', username: 'bob', role: 'viewer' } },
      })

      const user = await client.createUser('token', 'bob', 'pass', 'viewer')
      expect(user.username).toBe('bob')
    })
  })

  describe('deleteUser', () => {
    it('resolves on success', async () => {
      mockAxios.delete.mockResolvedValue({ status: 204 })

      await expect(client.deleteUser('token', 'user-id')).resolves.toBeUndefined()
    })

    // The 400 here is admin-api refusing "delete your own account". Swallowed,
    // that button did nothing and said nothing.
    it('throws on refusal instead of reporting a silent no-op', async () => {
      mockAxios.delete.mockRejectedValue({ response: { status: 400 } })

      await expect(client.deleteUser('token', 'self-id')).rejects.toBeDefined()
    })
  })

  describe('listPlatforms', () => {
    it('fetches platforms for a vertical', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: [{ slug: 'fortnox', enabled: true, hasConfig: true }] },
      })
      const platforms = await client.listPlatforms('token', 'logistics')
      expect(platforms).toHaveLength(1)
      expect(platforms[0].slug).toBe('fortnox')
      expect(mockAxios.get).toHaveBeenCalledWith('/api/verticals/logistics/platforms', {
        headers: { Authorization: 'Bearer token' },
      })
    })
  })

  describe('enablePlatform', () => {
    it('posts enable with config', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 })
      await client.enablePlatform('token', 'logistics', 'fedex', { clientId: 'abc' })
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/verticals/logistics/platforms/fedex/enable',
        { config: { clientId: 'abc' } },
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('disablePlatform', () => {
    it('posts disable', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 })
      await client.disablePlatform('token', 'logistics', 'fedex')
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/verticals/logistics/platforms/fedex/disable',
        {},
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('setPlatformConfig', () => {
    it('puts config update', async () => {
      mockAxios.put.mockResolvedValue({ status: 200 })
      await client.setPlatformConfig('token', 'logistics', 'fedex', { clientSecret: 'xyz' })
      expect(mockAxios.put).toHaveBeenCalledWith(
        '/api/verticals/logistics/platforms/fedex/config',
        { config: { clientSecret: 'xyz' } },
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('getPlatformConfig', () => {
    it('returns the redacted record on 200', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: { clientId: 'cid', redirectUri: 'https://x', scopes: ['a'], hasSecret: true } },
      })
      const result = await client.getPlatformConfig('token', 'accounting', 'fortnox')
      expect(result).toEqual({ clientId: 'cid', redirectUri: 'https://x', scopes: ['a'], hasSecret: true })
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/api/verticals/accounting/platforms/fortnox/config',
        { headers: { Authorization: 'Bearer token' } },
      )
    })

    it('returns null on 404', async () => {
      mockAxios.get.mockRejectedValue({ response: { status: 404 } })
      const result = await client.getPlatformConfig('token', 'accounting', 'unknown')
      expect(result).toBeNull()
    })

    it('rethrows on 5xx', async () => {
      mockAxios.get.mockRejectedValue({ response: { status: 502 }, message: 'bad gateway' })
      await expect(client.getPlatformConfig('token', 'accounting', 'fortnox')).rejects.toMatchObject({
        response: { status: 502 },
      })
    })
  })

  describe('getCompanyInfo', () => {
    it('returns the record from the API', async () => {
      mockAxios.get.mockResolvedValue({
        data: { data: { name: 'Acme', updatedAt: 12345, updatedBy: 'u1' } },
      })
      const result = await client.getCompanyInfo('token')
      expect(result).toEqual({ name: 'Acme', updatedAt: 12345, updatedBy: 'u1' })
      expect(mockAxios.get).toHaveBeenCalledWith('/api/company-info', {
        headers: { Authorization: 'Bearer token' },
      })
    })

    it('returns null when nothing is saved', async () => {
      mockAxios.get.mockResolvedValue({ data: { data: null } })
      const result = await client.getCompanyInfo('token')
      expect(result).toBeNull()
    })
  })

  describe('setCompanyInfo', () => {
    it('puts the patch and returns the saved record', async () => {
      mockAxios.put.mockResolvedValue({
        data: { data: { name: 'Acme', website: 'https://acme.example.com', updatedAt: 1, updatedBy: 'u1' } },
      })
      const result = await client.setCompanyInfo('token', {
        name: 'Acme',
        website: 'https://acme.example.com',
      })
      expect(result.name).toBe('Acme')
      expect(mockAxios.put).toHaveBeenCalledWith(
        '/api/company-info',
        { name: 'Acme', website: 'https://acme.example.com' },
        { headers: { Authorization: 'Bearer token' } },
      )
    })
  })

  describe('resetCompanyInfo', () => {
    it('deletes the record', async () => {
      mockAxios.delete.mockResolvedValue({ status: 204, data: '' })
      await client.resetCompanyInfo('token')
      expect(mockAxios.delete).toHaveBeenCalledWith('/api/company-info', {
        headers: { Authorization: 'Bearer token' },
      })
    })
  })

  describe('listSyncJobs', () => {
    it('GETs /api/sync-jobs with filters and returns the array', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          data: [
            { id: 'job-1', vertical: 'accounting', connectionId: 'c1', platform: 'fortnox', status: 'completed' },
          ],
        },
      })
      const result = await client.listSyncJobs('token', { vertical: 'accounting', status: 'completed' })
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('job-1')
      expect(mockAxios.get).toHaveBeenCalledWith('/api/sync-jobs', {
        headers: { Authorization: 'Bearer token' },
        params: { vertical: 'accounting', status: 'completed' },
      })
    })
  })

  describe('cancelSyncJob', () => {
    it('POSTs /api/sync-jobs/:id/cancel and returns the updated job', async () => {
      mockAxios.post.mockResolvedValue({
        data: { data: { id: 'job-1', status: 'failed', error: 'cancelled by admin' } },
      })
      const result = await client.cancelSyncJob('token', 'job-1')
      expect(result?.status).toBe('failed')
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/sync-jobs/job-1/cancel',
        undefined,
        { headers: { Authorization: 'Bearer token' } },
      )
    })

    // Was `returns null on error`. "Already finished", "no such job" and
    // "admin-api is down" are three different things to tell an operator who
    // just pressed Cancel, and null was all three.
    it('throws on error instead of reporting a silent no-op', async () => {
      mockAxios.post.mockRejectedValue(new Error('404'))
      await expect(client.cancelSyncJob('token', 'missing')).rejects.toThrow()
    })
  })

  describe('getDataStoreMetrics', () => {
    it('GETs /api/data-store/metrics and returns the metrics object', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          data: {
            mode: 'database',
            path: '/data/resources.db',
            rows: { total: 42, per_vertical: { accounting: 42 }, oldest_age_ms: 1000 },
            sync_jobs: { pending: 0, running: 0, failed_recent: 0, per_vertical: {} },
            db_size_bytes: 8192,
            db_size_mb: 0.0,
            timestamp: '2026-04-27T20:00:00.000Z',
          },
        },
      })
      const metrics = await client.getDataStoreMetrics('token')
      expect(metrics?.mode).toBe('database')
      expect(metrics?.rows.total).toBe(42)
      expect(mockAxios.get).toHaveBeenCalledWith('/api/data-store/metrics', {
        headers: { Authorization: 'Bearer token' },
      })
    })
  })

  /**
   * `getApiKey` is the only client method with no endpoint behind it: admin-api
   * exposes list, mint and revoke, so the detail page's lookup is a list plus a
   * filter. Every route test mocks this class wholesale, so without these the
   * method is never executed — and a refactor to a `GET /api/api-keys/:id` that
   * does not exist would 404 every detail page with nothing failing first.
   */
  describe('getApiKey', () => {
    const KEYS = [
      {
        id: 'key-1',
        tenantId: 'acme',
        prefix: 'osk_acme_1',
        label: 'CI',
        scopes: ['mcp:read'],
        createdAt: 1,
        lastUsedAt: null,
        revokedAt: null,
      },
      {
        id: 'key-2',
        tenantId: 'other',
        prefix: 'osk_other_2',
        label: null,
        scopes: ['*'],
        createdAt: 2,
        lastUsedAt: null,
        revokedAt: null,
      },
    ]

    it('reads the list endpoint unfiltered and picks the id out of it', async () => {
      mockAxios.get.mockResolvedValue({ data: { data: KEYS } })
      const key = await client.getApiKey('token', 'key-2')
      expect(key?.id).toBe('key-2')
      // Unfiltered on purpose: the id alone does not say which tenant owns it,
      // so passing a tenantId here would hide every key but one tenant's.
      expect(mockAxios.get).toHaveBeenCalledWith('/api/api-keys', {
        headers: { Authorization: 'Bearer token' },
        params: undefined,
      })
    })

    it('returns null for an id no key has', async () => {
      mockAxios.get.mockResolvedValue({ data: { data: KEYS } })
      expect(await client.getApiKey('token', 'key-404')).toBeNull()
    })

    it('propagates an upstream failure instead of reporting the key missing', async () => {
      // "admin-api is unreachable" and "no key has that id" are different
      // facts, and null cannot express both. Collapsing them renders a page
      // telling the operator the key does not exist, sending them to look for
      // who deleted it. This is the same swallow that kept a 415 on
      // rotate-secret hidden behind "Failed to rotate secret" for weeks.
      mockAxios.get.mockRejectedValue(new Error('ECONNREFUSED'))
      await expect(client.getApiKey('token', 'key-1')).rejects.toThrow(/ECONNREFUSED/)
    })
  })
})
