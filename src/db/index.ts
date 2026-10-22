/**
 * لایه‌ی دیتابیس — SQLite تک‌فایلی در `data/ticket-hunter.db`.
 *
 * چیزی که ذخیره می‌کنیم: رصدها، پروفایل مسافران، تاریخچه‌ی چرخه‌ها،
 * بلیت‌های پیداشده و تنظیمات محلی پنل.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, LEGACY_SETTINGS_SEED } from '../config/env.js';

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'ticket-hunter.db'));

// WAL نوشتن و خواندن همزمان را روان می‌کند — رصد می‌نویسد، داشبورد می‌خواند.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * ساخت جدول‌ها. چون این یک اپ تک‌کاربره‌ی محلی است، به جای سیستم
 * migration کامل از `CREATE TABLE IF NOT EXISTS` استفاده می‌کنیم.
 * ستون‌های پیچیده (فیلترها، زمان‌بندی) به صورت JSON ذخیره می‌شوند.
 */
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS passengers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName    TEXT NOT NULL,
      lastName     TEXT NOT NULL,
      nationalId   TEXT NOT NULL,
      birthDate    TEXT NOT NULL,
      ageType      TEXT NOT NULL DEFAULT 'بزرگسال',
      meal         TEXT NOT NULL DEFAULT 'بدون غذا',
      discountCode TEXT NOT NULL DEFAULT '',
      createdAt    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watches (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      fromStationCode   INTEGER NOT NULL,
      toStationCode     INTEGER NOT NULL,
      dates             TEXT NOT NULL,          -- JSON: string[]
      adult             INTEGER NOT NULL DEFAULT 1,
      child             INTEGER NOT NULL DEFAULT 0,
      infant            INTEGER NOT NULL DEFAULT 0,
      ticketType        TEXT NOT NULL DEFAULT 'Family',
      charterCoupe      INTEGER NOT NULL DEFAULT 0,
      filters           TEXT NOT NULL,          -- JSON
      schedule          TEXT NOT NULL,          -- JSON
      ranking           TEXT NOT NULL,          -- JSON
      passengerFillMode TEXT NOT NULL DEFAULT 'profile',
      passengerIds      TEXT NOT NULL DEFAULT '[]',
      contactMobile     TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'idle',
      runCount          INTEGER NOT NULL DEFAULT 0,
      lastRunAt         TEXT,
      lastError         TEXT,
      createdAt         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- هر چرخه‌ی رصد یک ردیف اینجا می‌سازد
    CREATE TABLE IF NOT EXISTS runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      watchId     INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      startedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      finishedAt  TEXT,
      offersFound INTEGER NOT NULL DEFAULT 0,
      matched     INTEGER NOT NULL DEFAULT 0,
      note        TEXT
    );

    -- بلیت‌هایی که در هر چرخه دیده شده‌اند
    CREATE TABLE IF NOT EXISTS offers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      runId       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      watchId     INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      owner       TEXT,
      salonTitle  TEXT,
      salonType   TEXT,
      trainNumber INTEGER,
      departTime  TEXT,
      arriveTime  TEXT,
      priceRial   INTEGER,
      seats       INTEGER,
      status      TEXT,
      isMatch     INTEGER NOT NULL DEFAULT 0,
      seenAt      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- تنها یک سند تنظیمات داریم. رمزها هرگز از API خواندن برگردانده نمی‌شوند.
    CREATE TABLE IF NOT EXISTS app_settings (
      id        INTEGER PRIMARY KEY CHECK (id = 1),
      value     TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_watch  ON runs(watchId, startedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_offers_run  ON offers(runId);
    CREATE INDEX IF NOT EXISTS idx_offers_watch ON offers(watchId, seenAt DESC);
  `);

  // نصب‌های قبلی را بدون نیاز به ورود دوباره‌ی اطلاعات، فقط یک‌بار منتقل کن.
  db.prepare(
    `INSERT OR IGNORE INTO app_settings (id, value) VALUES (1, ?)`,
  ).run(
    JSON.stringify({
      rajaUsername: LEGACY_SETTINGS_SEED.RAJA_USERNAME,
      rajaPassword: LEGACY_SETTINGS_SEED.RAJA_PASSWORD,
      smsMode: LEGACY_SETTINGS_SEED.MELIPAYAMAK_MODE,
      smsUsername: LEGACY_SETTINGS_SEED.MELIPAYAMAK_USERNAME,
      smsPassword: LEGACY_SETTINGS_SEED.MELIPAYAMAK_PASSWORD,
      smsFrom: LEGACY_SETTINGS_SEED.MELIPAYAMAK_FROM,
      smsBodyId: LEGACY_SETTINGS_SEED.MELIPAYAMAK_BODY_ID,
      notifyMobile: LEGACY_SETTINGS_SEED.NOTIFY_MOBILE,
      headless: LEGACY_SETTINGS_SEED.HEADLESS,
    }),
  );
}
