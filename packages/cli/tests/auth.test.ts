import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'fs'
import { tmpdir, platform } from 'os'
import { join } from 'path'
import {
  readCredentials,
  writeCredentials,
  clearCredentials,
  resolveAuth,
  credentialsPath,
  credentialsFileMode,
} from '../src/auth'

describe('credentials file', () => {
  let home: string
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'os-auth-'))
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('round-trips creds through ~/.config/opensteward/credentials.json', () => {
    const p = writeCredentials(
      { baseUrl: 'http://example.test', jwt: 'abc.def.ghi', username: 'admin' },
      home,
    )
    expect(p).toBe(credentialsPath(home))
    expect(existsSync(p)).toBe(true)
    const read = readCredentials(home)
    expect(read).toEqual({
      baseUrl: 'http://example.test',
      jwt: 'abc.def.ghi',
      username: 'admin',
    })
  })

  it('writes the file with mode 0600', () => {
    if (platform() === 'win32') return // POSIX mode is meaningless here
    writeCredentials({ baseUrl: 'http://x', jwt: 'tok' }, home)
    const mode = credentialsFileMode(home)
    expect(mode).toBe(0o600)
  })

  it('clearCredentials empties the file but keeps the path', () => {
    writeCredentials({ baseUrl: 'http://x', jwt: 'tok' }, home)
    const cleared = clearCredentials(home)
    expect(cleared).toBe(true)
    const p = credentialsPath(home)
    expect(readFileSync(p, 'utf8').trim()).toBe('{}')
  })

  it('returns null when the file does not exist', () => {
    expect(readCredentials(home)).toBeNull()
  })

  it('returns null when the file is malformed JSON', () => {
    const p = writeCredentials({ baseUrl: 'http://x' }, home)
    // Corrupt the file.
    require('fs').writeFileSync(p, '{not json}')
    expect(readCredentials(home)).toBeNull()
  })
})

describe('resolveAuth priority', () => {
  let home: string
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'os-auth-'))
  })
  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('uses the explicit flag token when present', () => {
    writeCredentials({ baseUrl: 'http://from-file', jwt: 'file-tok' }, home)
    const r = resolveAuth({
      home,
      env: { OS_TOKEN: 'env-tok' },
      tokenFlag: 'flag-tok',
      baseUrlFlag: 'http://flag',
    })
    expect(r.token).toBe('flag-tok')
    expect(r.source).toBe('flag')
    expect(r.baseUrl).toBe('http://flag')
  })

  it('prefers env (OS_TOKEN) over the credentials file', () => {
    writeCredentials({ baseUrl: 'http://from-file', jwt: 'file-tok' }, home)
    const r = resolveAuth({ home, env: { OS_TOKEN: 'env-tok' } })
    expect(r.token).toBe('env-tok')
    expect(r.source).toBe('env')
  })

  it('accepts OS_API_KEY as a token source', () => {
    const r = resolveAuth({ home, env: { OS_API_KEY: 'api-key' } })
    expect(r.token).toBe('api-key')
    expect(r.source).toBe('env')
  })

  it('falls back to the credentials file when no env / flag', () => {
    writeCredentials({ baseUrl: 'http://from-file', jwt: 'file-tok' }, home)
    const r = resolveAuth({ home, env: {} })
    expect(r.token).toBe('file-tok')
    expect(r.source).toBe('file')
    expect(r.baseUrl).toBe('http://from-file')
  })

  it('returns token=null + source=none with no creds anywhere', () => {
    const r = resolveAuth({ home, env: {} })
    expect(r.token).toBeNull()
    expect(r.source).toBe('none')
    // Default falls back to admin-api localhost.
    expect(r.baseUrl).toBe('http://localhost:3001')
  })

  it('honours OS_BASE_URL', () => {
    const r = resolveAuth({ home, env: { OS_BASE_URL: 'http://from-env' } })
    expect(r.baseUrl).toBe('http://from-env')
  })
})
