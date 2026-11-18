import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { RuntimeSettingsClient, SETTING } from '@opensteward/shared'
import { buildTestServer, type TestServer } from '../integration/helpers'
import { signDevLicense } from './dev-license'

let server: TestServer | undefined
afterEach(async () => {
  await server?.cleanup()
  server = undefined
  vi.restoreAllMocks()
})
const NO_MCP = ['vertical:crm', 'vertical:accounting']
const customers = (s: TestServer, key: string) =>
  s.fastify.inject({
    method: 'GET',
    url: '/v1/customers',
    headers: { authorization: `Bearer ${key}` },
  })

describe('MCP needs the runtime setting AND the license (P10) [L7:G14]', () => {
  it('a license without mcp refuses an mcp:read key with LICENSE_FEATURE_NOT_ENTITLED; a plain key still works', async () => {
    server = await buildTestServer({ license: signDevLicense({ features: NO_MCP }) })
    const mcp = (
      await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read', 'customers:read'] })
    ).plaintext
    const plain = (await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['customers:read'] }))
      .plaintext
    const refused = await customers(server, mcp)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error).toEqual({
      code: 'LICENSE_FEATURE_NOT_ENTITLED',
      message: expect.stringContaining("'mcp'"),
    })
    expect((await customers(server, plain)).statusCode).toBe(200)
  })

  // The other half of the AND (review m46): the setting can switch MCP off
  // even though the license includes it. The settings cache is seeded the way
  // admin-api's poll would fill it, in place of the poll at boot.
  it('features.mcp_enabled = false refuses an mcp:read key with MCP_DISABLED, though the license includes mcp', async () => {
    vi.spyOn(RuntimeSettingsClient.prototype, 'start').mockImplementation(async function (
      this: RuntimeSettingsClient,
    ) {
      this.setForTest(SETTING.FEATURES_MCP_ENABLED, false, 'boolean')
    })
    server = await buildTestServer()
    expect(server.license.entitlements().has('mcp')).toBe(true)
    const mcp = (
      await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read', 'customers:read'] })
    ).plaintext
    const plain = (await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['customers:read'] }))
      .plaintext
    const refused = await customers(server, mcp)
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('MCP_DISABLED')
    expect((await customers(server, plain)).statusCode).toBe(200)
  })

  it('a license with mcp lets the same key through', async () => {
    server = await buildTestServer()
    const mcp = (
      await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read', 'customers:read'] })
    ).plaintext
    expect((await customers(server, mcp)).statusCode).toBe(200)
  })

  it('community mode (no license) keeps MCP: community includes it', async () => {
    server = await buildTestServer({ license: null })
    const mcp = (
      await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read', 'customers:read'] })
    ).plaintext
    expect((await customers(server, mcp)).statusCode).toBe(200)
  })

  it('is read per request: a license without mcp removes it without a restart', async () => {
    server = await buildTestServer({ licenseVia: 'file' })
    const mcp = (
      await server.apiKeys.mint({ tenantId: 'tenant-a', scopes: ['mcp:read', 'customers:read'] })
    ).plaintext
    expect((await customers(server, mcp)).statusCode).toBe(200)
    writeFileSync(server.licenseFile, signDevLicense({ features: NO_MCP }))
    await server.license.refresh()
    expect((await customers(server, mcp)).json().error.code).toBe('LICENSE_FEATURE_NOT_ENTITLED')
  })
})
