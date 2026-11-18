import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { loadConfig, loadLicenseConfig } from '../src/config'

const KEYS = [
  'OPENSTEWARD_LICENSE',
  'OPENSTEWARD_LICENSE_FILE',
  'STORE_SECRET',
  'STORE_PATH',
  'CONFIG_PATH',
  'DATABASE_URL',
]
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  delete process.env['OPENSTEWARD_LICENSE']
  delete process.env['OPENSTEWARD_LICENSE_FILE']
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('loadLicenseConfig (D-A: the product reads the license environment here and only here)', () => {
  it('defaults to license.key next to the credential store (P4)', () => {
    expect(loadLicenseConfig('/srv/os/data/credentials.db')).toEqual({
      envToken: undefined,
      filePath: path.resolve('/srv/os/data/license.key'),
    })
  })

  it('OPENSTEWARD_LICENSE_FILE overrides the path, resolved to an absolute one', () => {
    process.env['OPENSTEWARD_LICENSE_FILE'] = '/etc/opensteward/license/license.key'
    expect(loadLicenseConfig('./data/credentials.db').filePath).toBe(
      '/etc/opensteward/license/license.key',
    )
    process.env['OPENSTEWARD_LICENSE_FILE'] = 'rel/license.key'
    expect(loadLicenseConfig('./data/credentials.db').filePath).toBe(
      path.resolve('rel/license.key'),
    )
  })

  it('the default for a relative store path is absolute too', () => {
    expect(loadLicenseConfig('./data/credentials.db').filePath).toBe(
      path.resolve('data/license.key'),
    )
  })

  it('empty or whitespace values are unset, as compose forwards them (`VAR=${VAR:-}`)', () => {
    process.env['OPENSTEWARD_LICENSE'] = '   '
    process.env['OPENSTEWARD_LICENSE_FILE'] = ''
    expect(loadLicenseConfig('/srv/os/data/credentials.db')).toEqual({
      envToken: undefined,
      filePath: path.resolve('/srv/os/data/license.key'),
    })
    process.env['OPENSTEWARD_LICENSE_FILE'] = ' \t '
    expect(loadLicenseConfig('/srv/os/data/credentials.db').filePath).toBe(
      path.resolve('/srv/os/data/license.key'),
    )
  })

  it('a set token is trimmed', () => {
    process.env['OPENSTEWARD_LICENSE'] = ' v4.public.abc \n'
    expect(loadLicenseConfig('x/c.db').envToken).toBe('v4.public.abc')
  })

  it('loadConfig carries it', () => {
    process.env['CONFIG_PATH'] = '/nonexistent/config.yml'
    delete process.env['DATABASE_URL']
    process.env['STORE_SECRET'] = 'Kd9mZ2pQ7vX4tR1nB6wL0sJ3hF8yC5aE2gU7iO4kP1x'
    process.env['STORE_PATH'] = '/srv/os/data/credentials.db'
    process.env['OPENSTEWARD_LICENSE_FILE'] = '/etc/opensteward/license/license.key'
    expect(loadConfig().license).toEqual({
      envToken: undefined,
      filePath: '/etc/opensteward/license/license.key',
    })
  })

  it('loadConfig defaults the file next to STORE_PATH', () => {
    process.env['CONFIG_PATH'] = '/nonexistent/config.yml'
    delete process.env['DATABASE_URL']
    process.env['STORE_SECRET'] = 'Kd9mZ2pQ7vX4tR1nB6wL0sJ3hF8yC5aE2gU7iO4kP1x'
    process.env['STORE_PATH'] = '/srv/os/data/credentials.db'
    expect(loadConfig().license?.filePath).toBe('/srv/os/data/license.key')
  })
})
