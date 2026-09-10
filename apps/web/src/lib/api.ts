/**
 * API base URL.
 *
 * An explicit `VITE_API_URL` (development, or a split deployment) wins. When it
 * is empty the client uses same-origin relative URLs, which is what a
 * single-origin deployment behind nginx wants: requests go to `/api/*` on the
 * same host, so the session cookie is first-party and CORS never applies.
 */
const API_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4000';

export const API_BASE = API_URL.replace(/\/$/, '');

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.fields = payload.fields;
    this.details = payload.details;
  }

  /** First message for a field, for inline form errors. */
  fieldError(field: string): string | undefined {
    return this.fields?.[field]?.[0];
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

type QueryValue = string | number | boolean | undefined | null | (string | number)[];

export function buildQuery(params: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Set for binary/text responses (CSV export, CSV template). */
  expect?: 'json' | 'text';
  headers?: Record<string, string>;
}

let unauthorizedHandler: (() => void) | null = null;

/** Lets the app shell react to an expired session without a hard reload. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, expect = 'json', headers = {} } = options;

  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: expect === 'text' ? 'text/csv, text/plain, */*' : 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    let payload: ApiErrorPayload = {
      code: 'unknown_error',
      message: `Request failed with status ${response.status}`,
    };
    try {
      const parsed = (await response.json()) as { error?: ApiErrorPayload };
      if (parsed?.error) payload = parsed.error;
    } catch {
      // Non-JSON error body (e.g. a proxy page).
    }
    if (response.status === 401) unauthorizedHandler?.();
    throw new ApiError(response.status, payload);
  }

  if (expect === 'text') return (await response.text()) as T;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/** Uploads one file as multipart/form-data (avatars, imports). */
export async function apiUpload<T>(path: string, file: File, field = 'file'): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) {
    let payload: ApiErrorPayload = { code: 'upload_failed', message: 'Upload failed' };
    try {
      const parsed = (await response.json()) as { error?: ApiErrorPayload };
      if (parsed?.error) payload = parsed.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, payload);
  }
  return (await response.json()) as T;
}

/** Triggers a browser download for a server-rendered text file. */
export async function downloadText(path: string, filename: string): Promise<void> {
  const text = await apiRequest<string>(path, { expect: 'text' });
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
