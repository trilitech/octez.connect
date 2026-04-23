import { keys } from '@tezos-x/octez.connect-utils'
import { MatrixRequest, MatrixRequestParams } from './models/api/MatrixRequest'
import { Logger } from '@tezos-x/octez.connect-core'

const logger = new Logger('MatrixHttpClient')

interface HttpOptions {
  accessToken?: string
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const CLIENT_API_R0 = '/_matrix/client/r0'

/**
 * Handling the HTTP connection to the matrix synapse node
 */
export class MatrixHttpClient {
  private readonly abortController: AbortController

  constructor(private readonly baseUrl: string) {
    this.abortController = new AbortController()
  }

  /**
   * Get data from the synapse node
   */
  public async get<T>(
    endpoint: string,
    params?: MatrixRequestParams<T>,
    options?: HttpOptions
  ): Promise<T> {
    return this.send('GET', endpoint, options, params)
  }

  /**
   * Post data to the synapse node
   */
  public async post<T>(
    endpoint: string,
    body: MatrixRequest<T>,
    options?: HttpOptions,
    params?: MatrixRequestParams<T>
  ): Promise<T> {
    return this.send('POST', endpoint, options, params, body)
  }

  /**
   * Put data to the synapse node
   */
  public async put<T>(
    endpoint: string,
    body: MatrixRequest<T>,
    options?: HttpOptions,
    params?: MatrixRequestParams<T>
  ): Promise<T> {
    return this.send('PUT', endpoint, options, params, body)
  }

  public async cancelAllRequests(): Promise<void> {
    this.abortController.abort('Manually cancelled')
  }

  /**
   * Send a request to the synapse node
   */
  private async send<T>(
    method: HttpMethod,
    endpoint: string,
    config?: HttpOptions,
    requestParams?: MatrixRequestParams<T>,
    data?: MatrixRequest<T>
  ): Promise<T> {
    const headers: Record<string, string> = {}
    if (data !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (config?.accessToken) {
      headers.Authorization = `Bearer ${config.accessToken}`
    }

    const params = requestParams ? this.getParams(requestParams) : undefined
    const url = this.buildUrl(this.apiUrl(CLIENT_API_R0), endpoint, params)

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: data !== undefined ? JSON.stringify(data) : undefined,
        signal: this.abortController.signal
      })
    } catch (error) {
      logger.error('send', (error as Error).name, (error as Error).message)
      throw error
    }

    const payload = await this.parseBody<T>(response)

    if (!response.ok) {
      logger.error('send', String(response.status), response.statusText, payload)
      throw payload
    }

    return payload
  }

  private async parseBody<T>(response: Response): Promise<T> {
    const text = await response.text()
    if (!text) {
      return undefined as unknown as T
    }
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }

  private buildUrl(
    base: string,
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): string {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    let url = `${base}${path}`
    if (params && Object.keys(params).length > 0) {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        search.append(key, String(value))
      }
      url += `?${search.toString()}`
    }

    return url
  }

  private getParams(
    _params: MatrixRequestParams<any>
  ): { [key: string]: string | number | boolean } | undefined {
    if (!_params) {
      return undefined
    }

    const params = Object.assign(_params, {})
    keys(params).forEach((key) => params[key] === undefined && delete params[key])

    return params as { [key: string]: string | number | boolean }
  }

  /**
   * Construct API URL
   */
  private apiUrl(...parts: string[]): string {
    const apiBase = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl

    const apiParts = parts.map((path) => (path.startsWith('/') ? path.slice(1) : path))

    return [apiBase, ...apiParts].join('/')
  }
}
