import axios, { type AxiosInstance } from 'axios'
import { PACKETA_API_BASE, PACKETA_FEED_API_BASE } from './constants'
import { apiKeyFromPassword } from './auth'
import type { Credentials } from '../../adapter/interface'
import { withRetry as withRetryBase } from '@opensteward/shared'

const withRetry = <T>(fn: () => Promise<T>, retries = 3) => withRetryBase(fn, retries)

/**
 * Low-level HTTP client for the Packeta REST API.
 *
 * Packeta's REST API wraps each method in a simple XML envelope:
 *
 *   POST https://www.zasilkovna.cz/api/rest
 *   Content-Type: application/xml
 *
 *   <?xml version="1.0" encoding="utf-8"?>
 *   <createPacket>
 *     <apiPassword>{apiPassword}</apiPassword>
 *     <packetAttributes>…</packetAttributes>
 *   </createPacket>
 *
 * Responses are XML documents. This client serialises/deserialises XML
 * using lightweight string templates and the built-in xml parser.
 */
export class PacketaClient {
  private readonly apiPassword: string
  private readonly apiKey: string
  private readonly http: AxiosInstance

  constructor(credentials: Credentials) {
    this.apiPassword = credentials.accessToken
    this.apiKey = apiKeyFromPassword(credentials.accessToken)

    this.http = axios.create({
      baseURL: PACKETA_API_BASE,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        Accept: 'application/xml',
      },
    })
  }

  // ── XML helpers ────────────────────────────────────────────────────────────

  private xmlHeader(): string {
    return '<?xml version="1.0" encoding="utf-8"?>'
  }

  /** Wrap the apiPassword and a body fragment in a top-level method element. */
  private buildBody(method: string, inner: string): string {
    return `${this.xmlHeader()}<${method}><apiPassword>${esc(this.apiPassword)}</apiPassword>${inner}</${method}>`
  }

  /** Pull the text content of the first matching XML tag. */
  static extract(xml: string, tag: string): string | undefined {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i')
    const m = re.exec(xml)
    return m ? m[1] : undefined
  }

  /** Pull all repeated elements matching a tag and return their raw XML strings. */
  static extractAll(xml: string, tag: string): string[] {
    const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'gi')
    return xml.match(re) ?? []
  }

  // ── SOAP-style REST methods ────────────────────────────────────────────────

  /**
   * createPacket — register a new parcel/packet in Packeta.
   * Returns raw XML response string.
   */
  async createPacket(attrs: Record<string, string | number | undefined>): Promise<string> {
    const inner = buildAttrsXml('packetAttributes', attrs)
    const body = this.buildBody('createPacket', inner)
    return this.postXml(body)
  }

  /**
   * packetStatus — retrieve current status for a packet by its Packeta barcode.
   */
  async packetStatus(barcode: string): Promise<string> {
    const body = this.buildBody('packetStatus', `<packetId>${esc(barcode)}</packetId>`)
    return this.postXml(body)
  }

  /**
   * packetTracking — retrieve full tracking history for a packet.
   */
  async packetTracking(barcode: string): Promise<string> {
    const body = this.buildBody('packetTracking', `<packetId>${esc(barcode)}</packetId>`)
    return this.postXml(body)
  }

  /**
   * packetLabelPdf — retrieve a shipping label PDF (base64-encoded) for a packet.
   *
   * @param barcode  Packeta packet barcode (e.g. "Z1234567890")
   * @param format   Label format: "A6 on A4", "A7 on A4", "105x148mm direct", "A8 on A4"
   * @param offset   Number of labels to skip (for multi-per-page formats)
   */
  async packetLabelPdf(barcode: string, format = 'A7 on A4', offset = 0): Promise<string> {
    const body = this.buildBody(
      'packetLabelPdf',
      `<packetId>${esc(barcode)}</packetId><format>${esc(format)}</format><offset>${offset}</offset>`,
    )
    return this.postXml(body)
  }

  /**
   * packetsLabelsPdf — batch label PDF for multiple packets.
   */
  async packetsLabelsPdf(barcodes: string[], format = 'A7 on A4', offset = 0): Promise<string> {
    const ids = barcodes.map((b) => `<id>${esc(b)}</id>`).join('')
    const body = this.buildBody(
      'packetsLabelsPdf',
      `<packetIds>${ids}</packetIds><format>${esc(format)}</format><offset>${offset}</offset>`,
    )
    return this.postXml(body)
  }

  /**
   * Download the home-delivery carrier list — the whole feed in one response.
   *
   * "The list is accessible in `JSON` format.
   *  https://pickup-point.api.packeta.com/v5/__API_KEY__/carrier/json?lang=__LANGUAGE__"
   * — https://docs.packeta.com/docs/home-delivery/carriers
   *
   * The documented "Result JSON" is a top-level array. The feed documents no
   * paging parameter, so every call returns every carrier. `lang` is left
   * off: the feeds filter table lists "en, cs, sk are supported." for it, but
   * the same section says "The filters are not applicable on list of
   * carriers." — https://docs.packeta.com/docs/pudo-delivery/packeta-pudos
   */
  async getCarriers(): Promise<unknown[]> {
    return withRetry(async () => {
      const url = `${PACKETA_FEED_API_BASE}/${encodeURIComponent(this.apiKey)}/carrier/json`
      const { data } = await axios.get<unknown>(url, { headers: { Accept: 'application/json' } })
      if (!Array.isArray(data)) {
        throw new Error('Packeta carrier feed did not return the documented JSON array')
      }
      return data
    })
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async postXml(body: string): Promise<string> {
    return withRetry(async () => {
      const { data } = await this.http.post<string>('', body)
      return typeof data === 'string' ? data : String(data)
    })
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** XML-escape a string value. */
function esc(val: string): string {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build a wrapper XML element containing child elements for each attribute. */
function buildAttrsXml(wrapper: string, attrs: Record<string, string | number | undefined>): string {
  const children = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<${k}>${esc(String(v!))}</${k}>`)
    .join('')
  return `<${wrapper}>${children}</${wrapper}>`
}
