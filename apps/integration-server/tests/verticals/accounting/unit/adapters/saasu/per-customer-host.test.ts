/**
 * Every Saasu API call is scoped to a company file by its numeric File ID, and
 * that ID is per customer. The Connect Link form must collect it alongside the
 * web services access key and store it where the client reads it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import axios from 'axios'
import { SaasuAdapter } from '../../../../../../src/verticals/accounting/adapters/saasu'

afterEach(() => {
  vi.restoreAllMocks()
})

const VALID = { apiKey: 'wsak_1', fileUid: '12345' }

describe('Saasu Connect Link form', () => {
  const adapter = new SaasuAdapter({ wsaccessKey: '', fileUid: '' })

  it('declares the access key and the File ID the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['apiKey', 'fileUid'])
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['fileUid']).toMatchObject({ type: 'text', required: true })
    expect(byName['fileUid']?.helpText).toMatch(/Web Services/)
  })

  it('rejects a blank access key', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, apiKey: '' })).rejects.toThrow(
      /Web services access key is required/,
    )
  })

  it('rejects a blank File ID', async () => {
    await expect(adapter.exchangeCredentials({ ...VALID, fileUid: ' ' })).rejects.toThrow(
      /File ID is required/,
    )
  })

  it.each(['acme', '12 345', '123abc', '-5'])(
    'rejects a non-numeric File ID %s',
    async (fileUid) => {
      await expect(adapter.exchangeCredentials({ ...VALID, fileUid })).rejects.toThrow(
        /File ID must be the numeric/,
      )
    },
  )

  it('returns the trimmed values in the shape the client reads', async () => {
    const creds = await adapter.exchangeCredentials({ apiKey: ' wsak_1 ', fileUid: ' 12345 ' })
    expect(creds).toEqual({ accessToken: 'wsak_1', extra: { fileUid: '12345' } })
  })
})

describe('Saasu client file scope comes from the connection', () => {
  it('sends the File ID and key as the documented FileId and wsAccessKey URL arguments', async () => {
    const get = vi.fn().mockResolvedValue({ data: { Name: 'Test File' } })
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new SaasuAdapter({ wsaccessKey: '', fileUid: '' })
    await adapter.getOrganization({ accessToken: 'wsak_1', extra: { fileUid: '12345' } })
    const headers = (create.mock.calls[0]![0] as { headers: Record<string, string> }).headers
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('wsaccesskey')
    expect(get).toHaveBeenCalledWith('FileIdentity', {
      params: { FileId: '12345', wsAccessKey: 'wsak_1' },
    })
  })

  it('refuses to build a request when the connection has no File ID', async () => {
    const get = vi.fn().mockResolvedValue({ data: {} })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new SaasuAdapter({ wsaccessKey: '', fileUid: '' })
    await expect(adapter.getOrganization({ accessToken: 'wsak_1' })).rejects.toThrow(
      /missing its File ID/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
