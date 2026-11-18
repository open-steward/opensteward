/**
 * Helpers shared across CellPoint Digital (Velocity) transforms.
 *
 * Velocity returns XML. Rather than pulling in a heavyweight XML dependency we
 * parse the small, flat operation responses with a minimal regex extractor —
 * the same convention the TallyPrime adapter follows. The parser yields a
 * plain object: element text content under the tag name, plus attributes under
 * `tag@attr` keys. Repeated tags become arrays.
 *
 * Money: Velocity amounts are already in the country's smallest currency unit
 * (minor units), matching the canonical schema — no float coercion needed.
 */

export interface XmlNode {
  /** Text content of the element (trimmed), if any. */
  $text?: string
  /** Attribute values keyed by attribute name. */
  $attr?: Record<string, string>
  /** Child elements keyed by tag name; repeated tags collapse to arrays. */
  [tag: string]: XmlNode | XmlNode[] | string | Record<string, string> | undefined
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    out[m[1]] = decodeEntities(m[2])
  }
  return out
}

/**
 * Parse a Velocity XML fragment into a nested object. Best-effort and
 * dependency-free; tolerant of missing/extra fields. Never throws — returns an
 * empty node for unparseable input (matching the missing-rather-than-wrong
 * transform contract).
 *
 * Element text content lands on `$text`, attributes on `$attr`, and repeated
 * child tags collapse to arrays.
 */
export function parseXml(xml: string | null | undefined): XmlNode {
  if (!xml || typeof xml !== 'string') return {}
  // Strip XML declaration + comments before the close-aware walk.
  const body = xml.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const root: XmlNode = {}
  const stack: XmlNode[] = [root]
  const tagRe = /<\/?([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(body))) {
    const [full, name, attrRaw, selfClose] = m
    const text = body.slice(cursor, m.index).trim()
    if (text) {
      const top = stack[stack.length - 1]
      top.$text = ((top.$text ?? '') + decodeEntities(text)).trim()
    }
    cursor = m.index + full.length

    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const node: XmlNode = {}
    const attrs = parseAttrs(attrRaw)
    if (Object.keys(attrs).length) node.$attr = attrs

    const parent = stack[stack.length - 1]
    const existing = parent[name]
    if (existing === undefined) {
      parent[name] = node
    } else if (Array.isArray(existing)) {
      ;(existing as XmlNode[]).push(node)
    } else {
      parent[name] = [existing as XmlNode, node]
    }
    if (!selfClose) stack.push(node)
  }
  return root
}

/** First child element matching `tag` (collapses arrays to their head). */
export function child(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  if (!node) return undefined
  const v = node[tag]
  if (Array.isArray(v)) return v[0]
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as XmlNode
  return undefined
}

/** All child elements matching `tag` as an array (empty when absent). */
export function children(node: XmlNode | undefined, tag: string): XmlNode[] {
  if (!node) return []
  const v = node[tag]
  if (Array.isArray(v)) return v as XmlNode[]
  if (v && typeof v === 'object') return [v as XmlNode]
  return []
}

/** Text content of a child element, or undefined. */
export function text(node: XmlNode | undefined, tag?: string): string | undefined {
  const n = tag ? child(node, tag) : node
  const t = n?.$text
  return t && t.length > 0 ? t : undefined
}

/** Attribute value of a node, or undefined. */
export function attr(node: XmlNode | undefined, name: string): string | undefined {
  const v = node?.$attr?.[name]
  return v && v.length > 0 ? v : undefined
}

/** Coerce a value to an integer (minor units / ids), or undefined. */
export function toInt(v: string | number | null | undefined): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/** Default + uppercase an ISO 4217 currency code. */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'USD').toUpperCase()
}

/** Build a canonical string map, dropping null/undefined and stringifying the rest. */
export function strMap(input: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined || v === '') continue
    out[k] = String(v)
  }
  return out
}
