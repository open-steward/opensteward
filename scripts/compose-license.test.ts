/**
 * The compose half of the license wiring (P4, D-A, D-E). ./opensteward-license
 * is mounted read-only, as a DIRECTORY, on integration-server only, and the
 * license file path points into it. "Only" is checked by the host folder as
 * well as the container path, across the base file and every overlay: a
 * second service binding ./opensteward-license anywhere, or inheriting the
 * mount through volumes_from, is a second license authority, and a name one
 * file declares and another uses is resolved across the files.
 * (check:secret-passthrough is the environment half: the license variables
 * reach integration-server alone.) The base file never builds a
 * development-profile image. Operator license files never reach git or a
 * build context. A single-file mount would pin the original inode, so a
 * renewed license.key would never reach the container.
 *
 * The host folder is not `./license`: the repository root already holds
 * `LICENSE`, and on a case-insensitive filesystem (macOS and Windows, so
 * Docker Desktop) `./license` IS that file. `mkdir license` fails there, and
 * Docker bind-mounts the LICENSE text over /etc/opensteward/license.
 *
 * Run: `pnpm exec tsx --test scripts/compose-license.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
type Volume = string | { source?: string; target?: string }
type Service = {
  volumes?: Volume[]
  volumes_from?: string[]
  container_name?: string
  environment?: string[] | Record<string, string>
}
type Compose = {
  services?: Record<string, Service | null>
  volumes?: Record<string, { driver_opts?: { device?: string } } | null>
}
const compose = load(read('docker-compose.yml')) as Compose & { services: Record<string, Service> }
/** A short-syntax volume's fields, split on the colons outside `${…}` (a default may hold one). */
function fields(v: string): string[] {
  const out = ['']
  let depth = 0
  for (let i = 0; i < v.length; i++) {
    if (v.startsWith('${', i)) depth++
    else if (v[i] === '}' && depth > 0) depth--
    if (v[i] === ':' && depth === 0) out.push('')
    else out[out.length - 1] += v[i]
  }
  return out
}
const targetOf = (v: Volume) => (typeof v === 'string' ? (fields(v)[1] ?? '') : (v.target ?? ''))
const sourceOf = (v: Volume) => (typeof v === 'string' ? (fields(v)[0] ?? '') : (v.source ?? ''))
const HOST_DIR = './opensteward-license'
const CONTAINER_DIR = '/etc/opensteward/license'
/** The host license folder as a whole path segment, wherever it sits in the source. */
const refersToHostDir = (source: string) =>
  /(^|[^a-z0-9_.-])opensteward-license([^a-z0-9_.-]|$)/i.test(source)

/**
 * Every compose file's named volumes, and each service's volumes_from and
 * container_name, merged: an overlay can use a volume, or inherit from a
 * service, that another file declares.
 */
function lookupAcross(docs: Compose[]): Compose {
  const services: Record<string, Service> = {}
  const volumes: NonNullable<Compose['volumes']> = {}
  for (const d of docs) {
    for (const [name, v] of Object.entries(d.volumes ?? {})) {
      if (v?.driver_opts?.device || !(name in volumes)) volumes[name] = v
    }
    for (const [name, svc] of Object.entries(d.services ?? {})) {
      const into = (services[name] ??= {})
      into.volumes_from = [...(into.volumes_from ?? []), ...(svc?.volumes_from ?? [])]
      into.container_name = svc?.container_name ?? into.container_name
    }
  }
  return { services, volumes }
}

/**
 * Every way a service other than integration-server reaches the license: the
 * container path, a bind mount of the host folder under any target, a named
 * volume whose local driver binds that folder, or `volumes_from` a service that
 * holds the license (integration-server itself, or one of the above), directly
 * or through another service: it inherits every mount, the license included.
 * One line per offending mount. `context` resolves names other files declare.
 */
function licenseMountViolations(doc: Compose, context: Compose = doc): string[] {
  const boundVolumes = new Set(
    Object.entries({ ...context.volumes, ...doc.volumes })
      .filter(([, v]) => refersToHostDir(v?.driver_opts?.device ?? ''))
      .map(([name]) => name),
  )
  const services = doc.services ?? {}
  const out: string[] = []
  const holders = new Set(['integration-server'])
  for (const [name, svc] of Object.entries(services)) {
    if (name === 'integration-server') continue
    for (const v of svc?.volumes ?? []) {
      const source = sourceOf(v)
      if (
        targetOf(v).startsWith(CONTAINER_DIR) ||
        refersToHostDir(source) ||
        boundVolumes.has(source)
      ) {
        out.push(`${name}: ${JSON.stringify(v)}`)
        holders.add(name)
      }
    }
  }
  // volumes_from: `service`, `service:ro`, or `container:<name>[:ro]`.
  const all = { ...context.services, ...services }
  const inheritsFrom = (name: string) => [
    ...new Set([
      ...(services[name]?.volumes_from ?? []),
      ...(context === doc ? [] : (context.services?.[name]?.volumes_from ?? [])),
    ]),
  ]
  const serviceOf = (entry: string): string => {
    const ref = entry.replace(/:(?:ro|rw)$/, '')
    if (!ref.startsWith('container:')) return ref
    const container = ref.slice('container:'.length)
    const named = Object.entries(all).find(([, s]) => s?.container_name === container)?.[0]
    // Without a container_name, compose names it <project>-integration-server-1.
    return (
      named ??
      (/(?:^|[-_])integration-server(?:[-_]\d+)?$/.test(container)
        ? 'integration-server'
        : container)
    )
  }
  for (let grew = true; grew;) {
    grew = false
    for (const name of Object.keys(all)) {
      if (holders.has(name)) continue
      const from = inheritsFrom(name)
      if (!from.some((e) => holders.has(serviceOf(e)))) continue
      holders.add(name)
      grew = true
      if (name in services) out.push(`${name}: volumes_from ${JSON.stringify(from)}`)
    }
  }
  return out
}
/** Every compose file at the repository root: an operator layers the overlays on the base. */
const COMPOSE_FILES = readdirSync(ROOT).filter((f) => /^docker-compose(\..+)?\.ya?ml$/.test(f))
/** An overlay, parsed. Compose's merge tags (`ports: !reset []`) are dropped: js-yaml has no schema for them. */
const loadCompose = (file: string): Compose =>
  (load(read(file).replace(/(:[ \t]*)!(?:reset|override)\b/g, '$1')) ?? {}) as Compose

test('integration-server mounts ./opensteward-license read-only at /etc/opensteward/license', () => {
  const vols = compose.services['integration-server']?.volumes ?? []
  assert.ok(vols.includes(`${HOST_DIR}:/etc/opensteward/license:ro`), JSON.stringify(vols))
})

test('the host license folder is no other root entry on a case-insensitive filesystem', () => {
  // On macOS and Windows `./license` resolves to the tracked LICENSE file.
  const vols = compose.services['integration-server']?.volumes ?? []
  const mount = vols.find((v) => targetOf(v) === CONTAINER_DIR)
  assert.ok(mount, 'no license mount (parser guard)')
  const name = sourceOf(mount).replace(/^\.\//, '').split('/')[0] ?? ''
  assert.ok(name.length > 0, `unparseable mount source: ${JSON.stringify(mount)}`)
  const clashes = readdirSync(ROOT).filter(
    (e) => e !== name && e.toLowerCase() === name.toLowerCase(),
  )
  assert.deepEqual(clashes, [], `./${name} is ${clashes.join(', ')} on macOS and Windows`)
})

test('a second license mount is caught by target, by host folder, or through a named volume', () => {
  const other = (volumes: Volume[], extra: Compose = {}): Compose => ({
    services: {
      'integration-server': { volumes: [`${HOST_DIR}:${CONTAINER_DIR}:ro`] },
      'admin-api': { volumes },
    },
    ...extra,
  })
  for (const v of [
    `${HOST_DIR}:${CONTAINER_DIR}:ro`,
    './somewhere-else:/etc/opensteward/license/license.key:ro',
    `${HOST_DIR}:/run/license:ro`,
    'opensteward-license:/run/license',
    './opensteward-license/license.key:/run/license.key:ro',
    '${LICENSE_DIR:-./opensteward-license}:/run/license:ro',
    '${PWD}/OpenSteward-License:/run/license:ro',
    { type: 'bind', source: HOST_DIR, target: '/run/license', read_only: true } as Volume,
  ]) {
    assert.equal(licenseMountViolations(other([v])).length, 1, JSON.stringify(v))
  }
  const named = other(['licensed:/run/license:ro'], {
    volumes: { licensed: { driver_opts: { device: HOST_DIR } } },
  })
  assert.equal(licenseMountViolations(named).length, 1, 'a named volume binding the host folder')
  // Neighbours that are not the license folder pass.
  assert.deepEqual(
    licenseMountViolations(
      other(['./opensteward-license-notes:/notes:ro', 'admin-data:/app/data', './certs:/certs:ro']),
    ),
    [],
  )
})

test('volumes_from integration-server inherits its license mount, directly or through another service (review r5)', () => {
  const base: Compose = {
    services: {
      'integration-server': { volumes: [`${HOST_DIR}:${CONTAINER_DIR}:ro`] },
      'admin-api': { volumes: ['admin-data:/app/data'] },
    },
  }
  const plus = (services: Record<string, Service>): Compose => ({
    services: { ...base.services, ...services },
  })
  for (const from of [
    'integration-server',
    'integration-server:ro',
    'container:opensteward-integration-server-1',
  ]) {
    assert.deepEqual(
      licenseMountViolations(plus({ sidecar: { volumes_from: [from] } })),
      [`sidecar: volumes_from ${JSON.stringify([from])}`],
      from,
    )
  }
  // A container_name is resolved to its service.
  const named: Compose = {
    services: {
      'integration-server': { ...base.services!['integration-server'], container_name: 'is' },
      sidecar: { volumes_from: ['container:is:ro'] },
    },
  }
  assert.equal(licenseMountViolations(named).length, 1, 'container:<container_name>')
  // Through a service that inherits it, and from a service that mounts the folder itself.
  assert.equal(
    licenseMountViolations(
      plus({ hop: { volumes_from: ['integration-server'] }, sidecar: { volumes_from: ['hop'] } }),
    ).length,
    2,
  )
  assert.equal(
    licenseMountViolations(
      plus({
        'admin-api': { volumes: [`${HOST_DIR}:/run/license:ro`] },
        sidecar: { volumes_from: ['admin-api'] },
      }),
    ).length,
    2,
  )
  // Across files: the overlay's service inherits from one the base file declares.
  const overlay: Compose = { services: { sidecar: { volumes_from: ['hop'] } } }
  const withHop = plus({ hop: { volumes_from: ['integration-server'] } })
  assert.deepEqual(licenseMountViolations(overlay, lookupAcross([withHop, overlay])), [
    'sidecar: volumes_from ["hop"]',
  ])
  // Inheriting from a service without the license passes.
  assert.deepEqual(licenseMountViolations(plus({ sidecar: { volumes_from: ['admin-api'] } })), [])
})

test('a named volume binding the host folder is caught when another file declares it', () => {
  const declares: Compose = { volumes: { licensed: { driver_opts: { device: HOST_DIR } } } }
  const uses: Compose = { services: { 'admin-api': { volumes: ['licensed:/run/license:ro'] } } }
  assert.deepEqual(licenseMountViolations(uses), [], 'alone, the name is unknown (control)')
  assert.equal(licenseMountViolations(uses, lookupAcross([declares, uses])).length, 1)
})

test('no other service mounts the license, in the base file or an overlay (single license authority)', () => {
  assert.ok(COMPOSE_FILES.includes('docker-compose.yml'), COMPOSE_FILES.join(', '))
  const docs = COMPOSE_FILES.map(loadCompose)
  const context = lookupAcross(docs)
  docs.forEach((doc, i) => {
    assert.deepEqual(licenseMountViolations(doc, context), [], COMPOSE_FILES[i])
  })
})

test('the license file path defaults into that mount', () => {
  const env = compose.services['integration-server']?.environment
  const lines = Array.isArray(env) ? env : Object.entries(env ?? {}).map(([k, v]) => `${k}=${v}`)
  assert.ok(
    lines.includes(
      'OPENSTEWARD_LICENSE_FILE=${OPENSTEWARD_LICENSE_FILE:-/etc/opensteward/license/license.key}',
    ),
  )
})

test('docker-compose.yml never builds a development-profile image (D-E)', () =>
  assert.doesNotMatch(read('docker-compose.yml'), /OPENSTEWARD_BUILD_PROFILE/))

test('git and every build context ignore operator license files', () => {
  const gitignore = read('.gitignore')
    .split('\n')
    .map((l) => l.trim())
  assert.ok(gitignore.includes('/opensteward-license/') && gitignore.includes('/license.key'))
  assert.ok(
    !gitignore.includes('license.key'),
    'anchor it: an unanchored license.key would also ignore a future fixture of that name',
  )
  const dockerignore = read('.dockerignore')
    .split('\n')
    .map((l) => l.trim())
  assert.ok(dockerignore.includes('opensteward-license') && dockerignore.includes('**/license.key'))
})

test('git ignores a license where a source run reads it, and no fixture of that name', () => {
  // A relative OPENSTEWARD_LICENSE_FILE resolves from apps/integration-server
  // (docs/deployment/license.md), and release.ts stages its commit with
  // `git add -A`. Asked of git itself, without the developer's config: a
  // global excludes file must not make this pass on one machine only.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const ignored = (path: string): boolean => {
    const r = spawnSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: ROOT, env })
    assert.ok(r.status === 0 || r.status === 1, `git check-ignore ${path}: ${String(r.stderr)}`)
    return r.status === 0
  }
  for (const path of [
    'license.key',
    'opensteward-license/license.key',
    'apps/integration-server/license.key',
    'apps/integration-server/opensteward-license/license.key',
    'apps/integration-server/data/license.key',
  ]) {
    assert.ok(ignored(path), `${path} is not ignored: a license there reaches git`)
  }
  for (const path of [
    'packages/shared/tests/fixtures/license.key',
    'apps/integration-server/tests/licensing/license.key',
  ]) {
    assert.ok(
      !ignored(path),
      `${path} is ignored: a test fixture of that name could never be committed`,
    )
  }
})
