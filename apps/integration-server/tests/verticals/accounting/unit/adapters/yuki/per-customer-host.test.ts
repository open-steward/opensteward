/**
 * Every Yuki SOAP call names the administration it acts on, and that GUID is
 * per customer. The Connect Link form (the one Connect Link actually invokes —
 * not the legacy "key:administrationId" exchangeCode) must collect it.
 *
 * It is stored in `extra`, not `tenantId`: the control plane reads
 * `credentials.tenantId` as the OpenSteward tenant of the connection.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import axios from 'axios'
import { YukiAdapter } from '../../../../../../src/verticals/accounting/adapters/yuki'

afterEach(() => {
  vi.restoreAllMocks()
})

const ADMIN_ID = '0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d'
const VALID = { apiKey: 'yuki_key', administrationId: ADMIN_ID }

describe('Yuki Connect Link form', () => {
  const adapter = new YukiAdapter({ apiKey: '', administrationId: '' })

  it('declares the access key and the administration ID the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['administrationId', 'apiKey'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['administrationId']).toMatchObject({ type: 'text', required: true })
  })

  it('rejects a blank access key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      /Web service access key is required/,
    )
  })

  it('rejects a blank administration ID', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, administrationId: ' ' }),
    ).rejects.toThrow(/Administration ID is required/)
  })

  it.each(['acme', '12345', `${ADMIN_ID}0`])('rejects %s, which is not a GUID', async (administrationId) => {
    await expect(adapter.exchangeCredentials({ ...VALID, administrationId })).rejects.toThrow(
      /Administration ID must be a GUID/,
    )
  })

  it('normalises the ID and stores it in extra, leaving tenantId alone', async () => {
    const creds = await adapter.exchangeCredentials({
      apiKey: ' yuki_key ',
      administrationId: ' {0A1B2C3D-4E5F-4A7B-8C9D-0E1F2A3B4C5D} ',
    })
    expect(creds).toEqual({
      accessToken: 'yuki_key',
      extra: { administrationId: '0A1B2C3D-4E5F-4A7B-8C9D-0E1F2A3B4C5D' },
    })
    expect(creds.tenantId).toBeUndefined()
  })
})

describe('Yuki client administration comes from the connection', () => {
  it('sends the administration ID stored on the credentials', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: '<AuthenticateResult>sess-1</AuthenticateResult>' })
      .mockResolvedValue({ data: '<GetGLAccountSchemeResult></GetGLAccountSchemeResult>' })
    const adapter = new YukiAdapter({ apiKey: '', administrationId: '' })
    await adapter
      .listAccounts({ accessToken: 'yuki_key', extra: { administrationId: ADMIN_ID } }, {})
      .catch(() => undefined)
    const bodies = post.mock.calls.map((c) => String(c[1]))
    expect(bodies.some((b) => b.includes(`>${ADMIN_ID}<`))).toBe(true)
  })

  it('refuses to call Yuki when the connection has no administration ID', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: '' })
    const adapter = new YukiAdapter({ apiKey: '', administrationId: '' })
    await expect(adapter.listAccounts({ accessToken: 'yuki_key' }, {})).rejects.toThrow(
      /missing its Administration ID/,
    )
    expect(post).not.toHaveBeenCalled()
  })
})
