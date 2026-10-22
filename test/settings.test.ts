/** تست ایزوله‌ی مهاجرت، ذخیره و قرارداد امن API تنظیمات. */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const originalCwd = process.cwd();
const isolatedRoot = mkdtempSync(join(tmpdir(), 'ticket-hunter-settings-'));
const legacyKeys = [
  'RAJA_USERNAME',
  'RAJA_PASSWORD',
  'MELIPAYAMAK_MODE',
  'MELIPAYAMAK_USERNAME',
  'MELIPAYAMAK_PASSWORD',
  'MELIPAYAMAK_FROM',
  'MELIPAYAMAK_BODY_ID',
  'NOTIFY_MOBILE',
  'HEADLESS',
] as const;
const originalEnv = Object.fromEntries(legacyKeys.map((key) => [key, process.env[key]]));

let database: typeof import('../src/db/index.js');
let settingsStore: typeof import('../src/config/settings.js');
let buildServer: typeof import('../src/server/app.js').buildServer;

before(async () => {
  process.chdir(isolatedRoot);
  Object.assign(process.env, {
    RAJA_USERNAME: '09120000000',
    RAJA_PASSWORD: 'legacy-raja-secret',
    MELIPAYAMAK_MODE: 'simple',
    MELIPAYAMAK_USERNAME: 'legacy-sms-user',
    MELIPAYAMAK_PASSWORD: 'legacy-sms-secret',
    MELIPAYAMAK_FROM: '50001234',
    MELIPAYAMAK_BODY_ID: '',
    NOTIFY_MOBILE: '09350000000',
    HEADLESS: 'true',
  });

  database = await import('../src/db/index.js');
  settingsStore = await import('../src/config/settings.js');
  ({ buildServer } = await import('../src/server/app.js'));
  database.migrate();
});

after(() => {
  database.db.close();
  process.chdir(originalCwd);
  for (const key of legacyKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(isolatedRoot, { recursive: true, force: true });
});

test('تنظیمات قدیمی فقط برای مقداردهی اولیه به SQLite منتقل می‌شوند', () => {
  const current = settingsStore.getRuntimeSettings();
  assert.equal(current.rajaUsername, '09120000000');
  assert.equal(current.rajaPassword, 'legacy-raja-secret');
  assert.equal(current.smsUsername, 'legacy-sms-user');
  assert.equal(current.headless, true);
});

test('API تنظیمات را به‌روزرسانی می‌کند و هیچ رمز یا API Key ای برنمی‌گرداند', async () => {
  const app = await buildServer();
  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        raja: { username: '۰۹۱۲۳۴۵۶۷۸۹', password: 'new-raja-secret' },
        sms: {
          mode: 'pattern',
          username: 'new-sms-user',
          password: 'new-sms-secret',
          from: '',
          bodyId: '۱۲۳۴۵',
          notifyMobile: '۰۹۳۵۱۲۳۴۵۶۷',
        },
        headless: false,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(response.body, /new-raja-secret|new-sms-secret/);
    const body = response.json();
    assert.equal(body.raja.username, '0912***6789');
    assert.equal(body.raja.hasPassword, true);
    assert.equal(body.sms.mode, 'pattern');
    assert.equal(body.sms.bodyId, '12345');
    assert.equal(body.sms.notifyMobile, '09351234567');
    assert.equal(body.headless, false);

    const persisted = settingsStore.getRuntimeSettings();
    assert.equal(persisted.rajaUsername, '09123456789');
    assert.equal(persisted.rajaPassword, 'new-raja-secret');
    assert.equal(persisted.smsBodyId, '12345');
    assert.equal(persisted.smsPassword, 'new-sms-secret');
  } finally {
    await app.close();
  }
});
