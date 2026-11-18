/**
 * The marketplace deploy forms set the chart's license.existingSecret, which
 * is a Secret NAME. A buyer may paste the license token there instead (the
 * field is labelled "License secret"). Rendered, it becomes
 * `secretName: "v4.public…"`, and Kubernetes refuses that Deployment with an
 * error that quotes the whole token into the deployer log. Each form refuses
 * anything but a Secret name before deploy. The chart's own schema, the last
 * line of defence for a `--set` or a values file, is pinned by
 * deploy/helm/opensteward/ci/check-license.sh.
 *
 * Run: `pnpm exec tsx --test scripts/marketplace-license.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

const ROOT = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Token-shaped: the PASETO prefix, upper case, '_', and far longer than a Secret name may be. */
const TOKEN = `v4.public.${'eyJBdWQiOiJvcGVuc3Rld2FyZCJ9_'.repeat(24)}`
const NOT_NAMES = [TOKEN, 'Os-License', 'os_license', '-os-license', 'os-license-', 'os license']

type Element = { name?: string; constraints?: { regex?: string }; elements?: Element[] }

function azureRegex(): RegExp {
  const ui = JSON.parse(read('deploy/marketplace/azure/createUiDefinition.json')) as {
    parameters: { steps: Element[] }
  }
  const all = (els: Element[]): Element[] => els.flatMap((e) => [e, ...all(e.elements ?? [])])
  const field = all(ui.parameters.steps).find((e) => e.name === 'licenseSecretName')
  assert.ok(field?.constraints?.regex, 'createUiDefinition.json: licenseSecretName has a regex')
  return new RegExp(field.constraints.regex)
}

function gcpPattern(): RegExp {
  const schema = load(read('deploy/marketplace/gcp/schema.yaml')) as {
    properties: Record<string, { pattern?: string } | undefined>
  }
  const pattern = schema.properties['license.existingSecret']?.pattern
  assert.ok(pattern, 'gcp/schema.yaml: license.existingSecret has a pattern')
  return new RegExp(pattern)
}

for (const [form, regex] of [
  ['Azure', azureRegex],
  ['GCP', gcpPattern],
] as const) {
  test(`${form}: the license secret field takes a Secret name or nothing, never a pasted token`, () => {
    const re = regex()
    for (const name of ['', 'opensteward-license', 'os-license-1']) {
      assert.ok(re.test(name), `${form} refuses the Secret name "${name}"`)
    }
    for (const bad of NOT_NAMES) {
      assert.ok(!re.test(bad), `${form} accepts "${bad.slice(0, 24)}" (${bad.length} chars)`)
    }
  })
}

test('GCP: a Secret name is at most 253 characters, dots allowed (an RFC 1123 subdomain)', () => {
  // That form has no maxLength, so the bound lives in the regex.
  const re = gcpPattern()
  assert.ok(re.test('os.license-1'))
  assert.ok(re.test('a'.repeat(253)))
  assert.ok(!re.test('a'.repeat(254)))
})
