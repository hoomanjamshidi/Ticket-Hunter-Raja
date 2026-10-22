/**
 * دسترسی به داده‌ها.
 *
 * ستون‌های JSON اینجا سریال/دسریال می‌شوند تا بقیه‌ی کد فقط با آبجکت‌های
 * تایپ‌دار کار کند و هیچ‌جای دیگری `JSON.parse` نبیند.
 */
import { db } from './index.js';
import {
  filtersSchema,
  passengerSchema,
  rankingSchema,
  runtimeSettingsSchema,
  scheduleSchema,
  type Passenger,
  type RuntimeSettings,
  type TrainOffer,
  type Watch,
  type WatchInput,
  type WatchStatus,
} from '../config/schema.js';

// ─── تنظیمات پنل ────────────────────────────────────────────────────────────

interface SettingsRow {
  value: string;
}

export const appSettings = {
  get(): RuntimeSettings | null {
    const row = db.prepare('SELECT value FROM app_settings WHERE id = 1').get() as
      | SettingsRow
      | undefined;
    return row ? runtimeSettingsSchema.parse(JSON.parse(row.value)) : null;
  },

  save(value: RuntimeSettings): RuntimeSettings {
    const parsed = runtimeSettingsSchema.parse(value);
    db.prepare(
      `INSERT INTO app_settings (id, value, updatedAt) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`,
    ).run(JSON.stringify(parsed));
    return parsed;
  },
};

// ─── مسافران ────────────────────────────────────────────────────────────────

export const passengers = {
  list(): Passenger[] {
    return db.prepare('SELECT * FROM passengers ORDER BY id').all() as Passenger[];
  },

  get(id: number): Passenger | null {
    return (db.prepare('SELECT * FROM passengers WHERE id = ?').get(id) as Passenger) ?? null;
  },

  create(input: Passenger): Passenger {
    const p = passengerSchema.parse(input);
    const info = db
      .prepare(
        `INSERT INTO passengers (firstName, lastName, nationalId, birthDate, ageType, meal, discountCode)
         VALUES (@firstName, @lastName, @nationalId, @birthDate, @ageType, @meal, @discountCode)`,
      )
      .run(p);
    return this.get(Number(info.lastInsertRowid))!;
  },

  update(id: number, input: Passenger): Passenger | null {
    const p = passengerSchema.parse(input);
    db.prepare(
      `UPDATE passengers SET firstName=@firstName, lastName=@lastName, nationalId=@nationalId,
       birthDate=@birthDate, ageType=@ageType, meal=@meal, discountCode=@discountCode WHERE id=@id`,
    ).run({ ...p, id });
    return this.get(id);
  },

  remove(id: number): void {
    db.prepare('DELETE FROM passengers WHERE id = ?').run(id);
  },
};

// ─── رصدها ──────────────────────────────────────────────────────────────────

/** ردیف خام جدول watches، پیش از باز کردن ستون‌های JSON */
interface WatchRow {
  id: number;
  name: string;
  fromStationCode: number;
  toStationCode: number;
  dates: string;
  adult: number;
  child: number;
  infant: number;
  ticketType: string;
  charterCoupe: number;
  filters: string;
  schedule: string;
  ranking: string;
  passengerFillMode: string;
  passengerIds: string;
  contactMobile: string;
  status: string;
  runCount: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

function rowToWatch(row: WatchRow): Watch {
  return {
    id: row.id,
    name: row.name,
    fromStationCode: row.fromStationCode,
    toStationCode: row.toStationCode,
    dates: JSON.parse(row.dates) as string[],
    adult: row.adult,
    child: row.child,
    infant: row.infant,
    ticketType: row.ticketType,
    charterCoupe: row.charterCoupe === 1,
    filters: filtersSchema.parse(JSON.parse(row.filters)),
    schedule: scheduleSchema.parse(JSON.parse(row.schedule)),
    ranking: rankingSchema.parse(JSON.parse(row.ranking)),
    passengerFillMode: row.passengerFillMode as Watch['passengerFillMode'],
    passengerIds: JSON.parse(row.passengerIds) as number[],
    contactMobile: row.contactMobile,
    status: row.status as WatchStatus,
    runCount: row.runCount,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

export const watches = {
  list(): Watch[] {
    const rows = db.prepare('SELECT * FROM watches ORDER BY id DESC').all() as WatchRow[];
    return rows.map(rowToWatch);
  },

  get(id: number): Watch | null {
    const row = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as WatchRow | undefined;
    return row ? rowToWatch(row) : null;
  },

  create(input: WatchInput): Watch {
    const info = db
      .prepare(
        `INSERT INTO watches (name, fromStationCode, toStationCode, dates, adult, child, infant,
           ticketType, charterCoupe, filters, schedule, ranking, passengerFillMode, passengerIds, contactMobile)
         VALUES (@name, @fromStationCode, @toStationCode, @dates, @adult, @child, @infant,
           @ticketType, @charterCoupe, @filters, @schedule, @ranking, @passengerFillMode, @passengerIds, @contactMobile)`,
      )
      .run({
        ...input,
        dates: JSON.stringify(input.dates),
        charterCoupe: input.charterCoupe ? 1 : 0,
        filters: JSON.stringify(input.filters),
        schedule: JSON.stringify(input.schedule),
        ranking: JSON.stringify(input.ranking),
        passengerIds: JSON.stringify(input.passengerIds),
      });
    return this.get(Number(info.lastInsertRowid))!;
  },

  update(id: number, input: WatchInput): Watch | null {
    db.prepare(
      `UPDATE watches SET name=@name, fromStationCode=@fromStationCode, toStationCode=@toStationCode,
         dates=@dates, adult=@adult, child=@child, infant=@infant, ticketType=@ticketType,
         charterCoupe=@charterCoupe, filters=@filters, schedule=@schedule, ranking=@ranking,
         passengerFillMode=@passengerFillMode, passengerIds=@passengerIds, contactMobile=@contactMobile
       WHERE id=@id`,
    ).run({
      ...input,
      id,
      dates: JSON.stringify(input.dates),
      charterCoupe: input.charterCoupe ? 1 : 0,
      filters: JSON.stringify(input.filters),
      schedule: JSON.stringify(input.schedule),
      ranking: JSON.stringify(input.ranking),
      passengerIds: JSON.stringify(input.passengerIds),
    });
    return this.get(id);
  },

  setStatus(id: number, status: WatchStatus, lastError: string | null = null): void {
    db.prepare('UPDATE watches SET status = ?, lastError = ? WHERE id = ?').run(
      status,
      lastError,
      id,
    );
  },

  markRun(id: number): void {
    db.prepare(
      "UPDATE watches SET runCount = runCount + 1, lastRunAt = datetime('now') WHERE id = ?",
    ).run(id);
  },

  remove(id: number): void {
    db.prepare('DELETE FROM watches WHERE id = ?').run(id);
  },
};

// ─── چرخه‌ها و بلیت‌های دیده‌شده ─────────────────────────────────────────────

export const runs = {
  start(watchId: number): number {
    const info = db.prepare('INSERT INTO runs (watchId) VALUES (?)').run(watchId);
    return Number(info.lastInsertRowid);
  },

  finish(runId: number, offersFound: number, matched: number, note?: string): void {
    db.prepare(
      "UPDATE runs SET finishedAt = datetime('now'), offersFound = ?, matched = ?, note = ? WHERE id = ?",
    ).run(offersFound, matched, note ?? null, runId);
  },

  /** آخرین چرخه‌ها برای صفحه‌ی تاریخچه */
  recent(watchId: number, limit = 50): unknown[] {
    return db
      .prepare('SELECT * FROM runs WHERE watchId = ? ORDER BY id DESC LIMIT ?')
      .all(watchId, limit);
  },
};

export const offers = {
  /** همه‌ی نتایج یک چرخه را یکجا ذخیره می‌کند. */
  saveMany(runId: number, watchId: number, list: TrainOffer[], matchIndexes: Set<number>): void {
    const insert = db.prepare(
      `INSERT INTO offers (runId, watchId, date, owner, salonTitle, salonType, trainNumber,
         departTime, arriveTime, priceRial, seats, status, isMatch)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction((items: TrainOffer[]) => {
      items.forEach((o, index) => {
        insert.run(
          runId,
          watchId,
          o.date,
          o.owner,
          o.salonTitle,
          o.salonType,
          o.trainNumber,
          o.departTime,
          o.arriveTime,
          o.priceRial,
          o.availableSeats,
          o.status,
          matchIndexes.has(index) ? 1 : 0,
        );
      });
    });
    tx(list);
  },

  latest(watchId: number, limit = 100): unknown[] {
    return db
      .prepare('SELECT * FROM offers WHERE watchId = ? ORDER BY id DESC LIMIT ?')
      .all(watchId, limit);
  },
};
