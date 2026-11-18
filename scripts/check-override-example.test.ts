import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE = join(import.meta.dirname, '..', 'docker-compose.override.example.yml')
const SSO_RULE = 'PathRegexp(`^/api/sso/[^/]+/(login|callback|acs)$`) || PathPrefix(`/scim/v2/`)'

test('the override example never routes admin-api as a whole', () => {
  const lines = readFileSync(FILE, 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*#\s?/, ''))
  const toAdminApi = lines
    .map((l) => l.match(/traefik\.http\.services\.([\w-]+)\.loadbalancer\.server\.port=3001/)?.[1])
    .filter((n): n is string => Boolean(n))
  assert.ok(toAdminApi.length > 0, 'expected the SSO example to exist (parser guard)')
  for (const name of toAdminApi) {
    const rule = lines.find((l) => l.includes(`traefik.http.routers.${name}.rule=`))
    assert.ok(rule, `router ${name} has no rule`)
    assert.ok(
      rule.includes(SSO_RULE),
      `router ${name} publishes more of admin-api than SSO/SCIM: ${rule}`,
    )
  }
})

const uncommented = () =>
  readFileSync(FILE, 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*#\s?/, ''))
const serviceAbove = (lines: string[], at: number) =>
  lines
    .slice(0, at)
    .reverse()
    .find((x) => /^[a-z][a-z-]*:\s*$/.test(x))
    ?.trim()

test('the license example mounts another host DIRECTORY, read-only, on integration-server only', () => {
  const lines = uncommented()
  const hits = lines.flatMap((l, i) =>
    /:\/etc\/opensteward\/license(?::ro)?\s*$/.test(l) ? [i] : [],
  )
  assert.equal(hits.length, 1, 'expected exactly one license mount example (parser guard)')
  const at = hits[0]!
  const m = /-\s*(\S+?):(\/etc\/opensteward\/license\S*?)(?::(ro))?\s*$/.exec(lines[at]!)
  assert.ok(m, `unparseable mount: ${lines[at]}`)
  assert.equal(
    m[2],
    '/etc/opensteward/license',
    'mount the DIRECTORY: a single-file bind mount never sees a renewed license.key',
  )
  assert.ok(!/license\.key$/.test(m[1]!), 'the host side is a directory too')
  assert.notEqual(
    m[1],
    './opensteward-license',
    'docker-compose.yml already mounts ./opensteward-license; the example is for another folder',
  )
  assert.equal(m[3], 'ro')
  assert.equal(
    serviceAbove(lines, at),
    'integration-server:',
    'only integration-server reads the license',
  )
})

test('the development build profile appears once, commented, as an integration-server build arg (D-E)', () => {
  const raw = readFileSync(FILE, 'utf8').split('\n')
  const hits = raw.flatMap((l, i) => (/OPENSTEWARD_BUILD_PROFILE:\s/.test(l) ? [i] : []))
  assert.equal(hits.length, 1, 'exactly one dev-profile example')
  const at = hits[0]!
  assert.match(
    raw[at]!,
    /^\s*#/,
    'never active in the example: a development image trusts the public dev1 key',
  )
  assert.match(raw[at]!, /OPENSTEWARD_BUILD_PROFILE:\s*development\s*$/)
  const lines = uncommented()
  assert.equal(lines[at - 1]?.trim(), 'args:')
  assert.equal(lines[at - 2]?.trim(), 'build:')
  assert.equal(serviceAbove(lines, at), 'integration-server:')
})
