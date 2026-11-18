import axios, { type AxiosInstance } from 'axios'
import { SAASU_API_BASE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { withRetry } from '@opensteward/shared'

/**
 * Saasu REST client (https://api.saasu.com/Help, fetched 2026-09-29).
 *
 * Authentication is the documented web-service-key method: "The use of
 * wsAccessKey and FileId on the URL as arguments". Every endpoint page lists
 * `FileId` ("Specifies the file id of the file to perform the operation
 * upon", integer, Required) and `WsAccessKey` ("The Web Service access key
 * for this user and file ...", Optional only when using OAuth) as URI
 * parameters. No request header carries the key, so none is sent.
 *
 * The format is chosen by header: "This header value can be either
 * application/json for JSON formatted data or application/xml" (Help,
 * Introduction), and every endpoint lists `application/json` among its
 * response formats.
 */
export class SaasuClient {
  private http: AxiosInstance
  /** The numeric file the connection is scoped to (`FileId`). */
  readonly fileId: string
  private accessKey: string

  /**
   * The File ID is per customer and lives on the connection (`extra.fileUid`,
   * set by the Connect Link form); the deployment-level `fileUid` is only a
   * fallback for connections created without it.
   */
  constructor(credentials: Credentials, fileUid?: string) {
    const stored = credentials.extra?.['fileUid']
    const storedFileUid =
      typeof stored === 'string' || typeof stored === 'number' ? String(stored) : ''
    this.fileId = storedFileUid || fileUid || ''
    if (!this.fileId) {
      throw new Error(
        'Saasu connection is missing its File ID; reconnect it and enter the File ID.',
      )
    }
    this.accessKey = credentials.accessToken
    this.http = axios.create({
      baseURL: SAASU_API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  /** GET with the documented `FileId` and `wsAccessKey` URL arguments. */
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const { data } = await this.http.get<T>(path, {
        params: { FileId: this.fileId, wsAccessKey: this.accessKey, ...params },
      })
      return data
    })
  }
}
