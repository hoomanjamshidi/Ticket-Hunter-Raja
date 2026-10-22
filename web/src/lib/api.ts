/** لایه‌ی نازک روی REST سرور. همه‌ی خطاها به پیام فارسی تبدیل می‌شوند. */

export interface Station {
  Code: number;
  Name: string;
  EnglishName: string;
}

export interface Passenger {
  id?: number;
  firstName: string;
  lastName: string;
  nationalId: string;
  birthDate: string;
  ageType: 'بزرگسال' | 'خردسال' | 'تبعه خارجی';
  meal: string;
  discountCode: string;
}

export type WatchStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaitingUser'
  | 'succeeded'
  | 'failed';

export interface StageState {
  watchId: number;
  stage: string;
  label: string;
  detail: string;
  at: string;
  nextInSec?: number;
}

export interface Watch {
  id: number;
  name: string;
  fromStationCode: number;
  toStationCode: number;
  dates: string[];
  adult: number;
  child: number;
  infant: number;
  ticketType: string;
  charterCoupe: boolean;
  filters: Record<string, unknown>;
  schedule: Record<string, unknown>;
  ranking: Record<string, unknown>;
  passengerFillMode: string;
  passengerIds: number[];
  contactMobile: string;
  status: WatchStatus;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  running: boolean;
  stage: StageState | null;
}

export interface Settings {
  raja: { configured: boolean; username: string; hasPassword: boolean };
  sms: {
    configured: boolean;
    mode: 'simple' | 'pattern';
    username: string;
    hasPassword: boolean;
    from: string;
    bodyId: string;
    hasBodyId: boolean;
    notifyMobile: string;
  };
  headless: boolean;
  proxy: {
    server: string;
    username: string;
    hasPassword: boolean;
    enabled: boolean;
  };
  runningWatchIds: number[];
}

export interface TestResult {
  ok: boolean;
  message: string;
  shouldSwitchToPattern?: boolean;
}

export interface ProxyTestResult extends TestResult {
  ip: string;
  country: string;
  usingProxy: boolean;
  rajaReachable: boolean;
}

export interface SettingsUpdate {
  raja?: { username?: string; password?: string };
  sms?: {
    mode?: 'simple' | 'pattern';
    username?: string;
    password?: string;
    from?: string;
    bodyId?: string;
    notifyMobile?: string;
  };
  headless?: boolean;
  proxy?: { server?: string; username?: string; password?: string };
}

export interface OfferRow {
  id: number;
  date: string;
  owner: string;
  salonTitle: string;
  salonType: string;
  trainNumber: number | null;
  departTime: string | null;
  arriveTime: string | null;
  priceRial: number | null;
  seats: number | null;
  status: string;
  isMatch: number;
  seenAt: string;
}

export interface RunRow {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  offersFound: number;
  matched: number;
  note: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * هدر content-type فقط وقتی گذاشته می‌شود که واقعاً بدنه‌ای وجود دارد.
   * Fastify درخواستِ بدون بدنه با این هدر را رد می‌کند و خطای
   * «Body cannot be empty…» می‌دهد — که دکمه‌های شروع/توقف/حذف را
   * بی‌صدا از کار می‌انداخت.
   */
  const headers = init?.body ? { 'content-type': 'application/json' } : undefined;
  const response = await fetch(path, { ...init, ...(headers ? { headers } : {}) });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `خطای سرور (${response.status})`);
  }
  return (await response.json()) as T;
}

export const api = {
  stations: () => request<Station[]>('/api/stations'),
  settings: () => request<Settings>('/api/settings'),
  testRaja: () => request<TestResult>('/api/settings/test-raja', { method: 'POST' }),
  testProxy: () => request<ProxyTestResult>('/api/settings/test-proxy', { method: 'POST' }),
  updateSettings: (body: SettingsUpdate) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  testSms: (body: { to?: string; mode?: 'simple' | 'pattern' }) =>
    request<{ ok: boolean; message: string; shouldSwitchToPattern: boolean }>(
      '/api/settings/test-sms',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  watches: () => request<Watch[]>('/api/watches'),
  createWatch: (body: unknown) =>
    request<Watch>('/api/watches', { method: 'POST', body: JSON.stringify(body) }),
  updateWatch: (id: number, body: unknown) =>
    request<Watch>(`/api/watches/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWatch: (id: number) => request<{ ok: true }>(`/api/watches/${id}`, { method: 'DELETE' }),
  startWatch: (id: number) =>
    request<{ started: boolean }>(`/api/watches/${id}/start`, { method: 'POST' }),
  stopWatch: (id: number) =>
    request<{ stopped: boolean }>(`/api/watches/${id}/stop`, { method: 'POST' }),
  runs: (id: number) => request<RunRow[]>(`/api/watches/${id}/runs`),
  offers: (id: number) => request<OfferRow[]>(`/api/watches/${id}/offers`),

  passengers: () => request<Passenger[]>('/api/passengers'),
  createPassenger: (body: Passenger) =>
    request<Passenger>('/api/passengers', { method: 'POST', body: JSON.stringify(body) }),
  updatePassenger: (id: number, body: Passenger) =>
    request<Passenger>(`/api/passengers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePassenger: (id: number) =>
    request<{ ok: true }>(`/api/passengers/${id}`, { method: 'DELETE' }),
};
