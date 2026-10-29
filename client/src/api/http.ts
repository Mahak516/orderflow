import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { AuthResult } from './types';

/**
 * The access token lives in memory only (never localStorage), so a script injected into
 * the page cannot steal a long-lived credential. The long-lived refresh token is an
 * httpOnly cookie the browser sends automatically to /api/auth.
 */
let accessToken: string | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const http = axios.create({ baseURL: '/api', withCredentials: true });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<AuthResult | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share ONE request:
 * refresh tokens rotate, so firing two at once would make the second one look like a replay.
 */
export function refreshSession(): Promise<AuthResult | null> {
  if (!refreshing) {
    refreshing = axios
      .post<AuthResult>('/api/auth/refresh', undefined, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// When a request fails because the access token expired, refresh once and replay it.
http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      const session = await refreshSession();
      if (session) {
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return http(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Pull a human-readable message out of an API error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; details?: { message: string }[] } | undefined;
    if (data?.details?.length) return data.details.map((d) => d.message).join('. ');
    if (data?.error) return data.error;
    if (!error.response) return 'Cannot reach the server. Check your connection.';
  }
  return fallback;
}
