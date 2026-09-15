import { getInitData } from './telegram';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'X-Telegram-Init-Data': getInitData(),
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return body;
}
