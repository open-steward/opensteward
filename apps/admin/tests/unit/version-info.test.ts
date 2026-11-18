/**
 * summarizeSystem — the System page's verdict for an operator who installs
 * published releases: which release, is every service up, did the last
 * upgrade finish (every service on one release). Per-service build detail
 * survives only in `bugReportText`.
 */
import { describe, expect, it } from 'vitest'
import { summarizeSystem, type VersionEntry, type VersionInfo } from '../../src/core/version-info'

function entry(over: Partial<VersionEntry> = {}): VersionEntry {
  return {
    name: 'svc',
    version: '1.0.0',
    release: '0.1.0',
    gitSha: 'abc1234',
    buildTime: '2026-10-01T12:00:00Z',
    ...over,
  }
}

function info(over: Partial<VersionInfo> = {}): VersionInfo {
  return {
    admin: entry({ name: 'admin' }),
    'admin-api': entry({ name: 'admin-api' }),
    'integration-server': entry({ name: 'integration-server' }),
    'docs-server': entry({ name: 'docs-server' }),
    'webhook-gateway': entry({ name: 'webhook-gateway' }),
    ...over,
  }
}

describe('summarizeSystem', () => {
  it('reports one release, every service running, and release notes for that tag', () => {
    const s = summarizeSystem(info())
    expect(s.release).toBe('0.1.0')
    expect(s.mismatch).toBe(false)
    expect(s.devBuild).toBe(false)
    expect(s.notResponding).toEqual([])
    expect(s.services.map((x) => [x.name, x.running])).toEqual([
      ['Admin console', true],
      ['Admin API', true],
      ['Integration server', true],
      ['Docs', true],
      ['Webhook gateway', true],
    ])
    expect(s.releaseNotesUrl).toBe(
      'https://github.com/open-steward/opensteward/releases/tag/platform%2Fv0.1.0',
    )
  })

  it('names a service that did not answer, and leaves it out of the release', () => {
    const s = summarizeSystem(info({ 'webhook-gateway': null }))
    expect(s.notResponding.map((x) => x.name)).toEqual(['Webhook gateway'])
    expect(s.release).toBe('0.1.0')
    expect(s.mismatch).toBe(false)
    expect(s.services.find((x) => x.key === 'webhook-gateway')).toMatchObject({
      running: false,
      release: null,
    })
  })

  it('flags a half-finished upgrade, counting a build with no release field as "unknown"', () => {
    const s = summarizeSystem(
      info({
        'integration-server': entry({ release: '0.2.0' }),
        'docs-server': entry({ release: undefined }),
      }),
    )
    expect(s.mismatch).toBe(true)
    expect(s.release).toBeNull()
    expect(s.releases).toEqual(['0.1.0', '0.2.0', 'unknown'])
    // No single release, so no single release page to point at.
    expect(s.releaseNotesUrl).toBe(
      'https://github.com/open-steward/opensteward/blob/main/CHANGELOG.md',
    )
  })

  it('calls it a development build only when every running service was built from source', () => {
    const dev = (k: keyof VersionInfo) => entry({ name: k, gitSha: 'dev' })
    expect(
      summarizeSystem(
        info({
          admin: dev('admin'),
          'admin-api': dev('admin-api'),
          'integration-server': dev('integration-server'),
          'docs-server': dev('docs-server'),
          'webhook-gateway': null,
        }),
      ).devBuild,
    ).toBe(true)
    expect(summarizeSystem(info({ admin: dev('admin') })).devBuild).toBe(false)
  })

  it('points a development build at the changelog, not a release page that does not exist', () => {
    const all = Object.fromEntries(
      Object.entries(info()).map(([k, v]) => [k, v && { ...v, gitSha: 'dev' }]),
    ) as VersionInfo
    expect(summarizeSystem(all).releaseNotesUrl).toBe(
      'https://github.com/open-steward/opensteward/blob/main/CHANGELOG.md',
    )
  })

  it('writes every service into the bug-report text, including one that is down', () => {
    const s = summarizeSystem(
      info({ 'admin-api': entry({ version: '1.4.2', gitSha: 'f00dfeed' }), 'docs-server': null }),
    )
    const lines = s.bugReportText.split('\n')
    expect(lines[0]).toBe('OpenSteward 0.1.0')
    expect(lines).toContain(
      'admin-api: release 0.1.0, version 1.4.2, git f00dfeed, built 2026-10-01T12:00:00Z',
    )
    expect(lines).toContain('docs-server: not responding')
    expect(lines).toHaveLength(6)
  })
})
