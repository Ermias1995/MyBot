import { getInitData } from './telegram';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export async function api(path, options = {}) {
  const headers = {
    'X-Telegram-Init-Data': getInitData(),
    ...(options.headers ?? {}),
  };

  let body = options.body;
  if (body != null && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }
  return data;
}
