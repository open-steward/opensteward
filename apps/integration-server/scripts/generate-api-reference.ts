/**
 * Generates docs/api-reference/api-reference.md from the unified
 * docs/openapi/openapi.json. Each operation becomes a section with method,
 * path, summary, description, parameters, request body shape, and response
 * codes. Operations are grouped by tag.
 *
 * Run after `pnpm --filter integration-server run generate-openapi`.
 */
import fs from 'node:fs'
import path from 'node:path'

interface Param {
  name: string
  in: string
  required?: boolean
  description?: string
  schema?: { type?: string | string[]; format?: string; enum?: unknown[] }
}

interface Operation {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: Param[]
  requestBody?: {
    required?: boolean
    description?: string
    content?: Record<string, { schema?: Record<string, unknown> }>
  }
  responses?: Record<string, { description?: string }>
}

interface Spec {
  info: { title: string; version: string; description?: string }
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, Record<string, Operation>>
}

const openapiPath = path.resolve(__dirname, '../../../docs/openapi/openapi.json')
if (!fs.existsSync(openapiPath)) {
  console.error(`✗ ${openapiPath} not found — run generate-openapi first.`)
  process.exit(1)
}

const spec: Spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'))

function fmtType(p: Param): string {
  const s = p.schema
  if (!s?.type) return 'string'
  const base = Array.isArray(s.type) ? s.type.join(' | ') : s.type
  return s.format ? `${base} (${s.format})` : base
}

function paramTable(params: Param[]): string {
  if (!params.length) return ''
  const rows = params.map(
    (p) =>
      `| \`${p.name}\` | ${p.in} | ${fmtType(p)} | ${p.required ? '**required**' : 'optional'} | ${(p.description ?? '').replace(/\n/g, ' ')} |`,
  )
  return [
    '',
    '| Param | In | Type | Required | Description |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

function bodySection(op: Operation): string {
  const json = op.requestBody?.content?.['application/json']
  if (!json) return ''
  const required = op.requestBody?.required ? ' (required)' : ''
  const desc = op.requestBody?.description ?? ''
  const ref = (json.schema as { $ref?: string } | undefined)?.$ref
  const refLabel = ref ? `\`${ref.replace('#/components/schemas/', '')}\`` : '`object`'
  return `\n**Request body**${required}: ${refLabel}${desc ? ` — ${desc}` : ''}\n`
}

function responseTable(responses: Operation['responses']): string {
  if (!responses) return ''
  const rows = Object.entries(responses).map(
    ([code, r]) => `| \`${code}\` | ${(r.description ?? '').replace(/\n/g, ' ')} |`,
  )
  return ['', '| Status | Description |', '|---|---|', ...rows, ''].join('\n')
}

function sortMethods(methods: string[]): string[] {
  const order = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']
  return methods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

const tagOrder = (spec.tags ?? []).map((t) => t.name)
const byTag: Record<string, Array<{ method: string; pathKey: string; op: Operation }>> = {}

for (const [pathKey, methods] of Object.entries(spec.paths)) {
  const ops = Object.entries(methods) as Array<[string, Operation]>
  for (const [method, op] of ops) {
    const tag = op.tags?.[0] ?? 'Other'
    byTag[tag] ??= []
    byTag[tag]!.push({ method, pathKey, op })
  }
}

// Order tags: spec.tags order first, then any extras alphabetically.
const allTags = [
  ...tagOrder.filter((t) => byTag[t]),
  ...Object.keys(byTag).filter((t) => !tagOrder.includes(t)).sort(),
]

const lines: string[] = [
  `# ${spec.info.title} — Unified API reference`,
  '',
  `Version: \`${spec.info.version}\`.`,
  '',
  `> **Auto-generated** from \`docs/openapi/openapi.json\`.`,
  `> Re-generate with \`pnpm --filter integration-server run generate:api-reference\`.`,
  '',
  '## Contents',
  '',
  ...allTags.map((t) => `- [${t}](#${t.toLowerCase().replace(/\s+/g, '-')})`),
  '',
]

for (const tag of allTags) {
  const tagDef = (spec.tags ?? []).find((t) => t.name === tag)
  lines.push(`## ${tag}`, '')
  if (tagDef?.description) lines.push(tagDef.description, '')
  const ops = byTag[tag]!.sort(
    (a, b) =>
      a.pathKey.localeCompare(b.pathKey) ||
      sortMethods([a.method, b.method]).indexOf(a.method),
  )
  for (const { method, pathKey, op } of ops) {
    lines.push(`### \`${method.toUpperCase()} ${pathKey}\``, '')
    if (op.summary) lines.push(`**${op.summary}**`, '')
    if (op.description) lines.push(op.description, '')
    if (op.parameters?.length) lines.push(paramTable(op.parameters))
    const body = bodySection(op)
    if (body) lines.push(body)
    const resp = responseTable(op.responses)
    if (resp) lines.push('**Responses**', resp)
  }
}

const outDir = path.resolve(__dirname, '../../../docs/api-reference')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'api-reference.md')
fs.writeFileSync(outPath, lines.join('\n') + '\n')
const opCount = Object.values(spec.paths).reduce((n, m) => n + Object.keys(m).length, 0)
console.log(`✓ wrote ${path.relative(process.cwd(), outPath)} (${opCount} operations across ${allTags.length} tags)`)
