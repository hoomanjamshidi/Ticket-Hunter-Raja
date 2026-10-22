/**
 * تست تقویم شمسی سمت مرورگر.
 *
 * این حساس‌ترین بخش داشبورد است: یک روز خطا یعنی بلیت روز اشتباه.
 * مقادیر مرجع با تقویم رسمی تطبیق داده شده‌اند.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  addDays,
  compareJalali,
  dateToJalali,
  daysInMonth,
  diffDays,
  formatJalali,
  isLeapYear,
  jalaliToDate,
  parseJalali,
  weekdayIndex,
} from '../web/src/lib/jalali.js';

test('تبدیل رفت و برگشت شمسی و میلادی', () => {
  // ۱۴۰۵/۰۶/۲۸ برابر ۱۹ سپتامبر ۲۰۲۶ است — همان تاریخی که در تست‌های واقعی رجا دیدیم
  const parts = { year: 1405, month: 6, day: 28 };
  const gregorian = jalaliToDate(parts);
  assert.equal(gregorian.toISOString().slice(0, 10), '2026-09-19');
  assert.deepEqual(dateToJalali(gregorian), parts);
});

test('نوروز سال‌های مرجع با تقویم رسمی می‌خواند', () => {
  const reference: Record<number, string> = {
    1400: '2021-03-21',
    1401: '2022-03-21',
    1402: '2023-03-21',
    1403: '2024-03-20',
    1404: '2025-03-20',
    1405: '2026-03-21',
    1406: '2027-03-21',
  };
  for (const [year, gregorian] of Object.entries(reference)) {
    assert.equal(
      jalaliToDate({ year: Number(year), month: 1, day: 1 }).toISOString().slice(0, 10),
      gregorian,
      `نوروز ${year}`,
    );
  }
});

test('تبدیل برای چند سال پیاپی پایدار می‌ماند', () => {
  for (let year = 1400; year <= 1420; year += 1) {
    const first = { year, month: 1, day: 1 };
    assert.deepEqual(dateToJalali(jalaliToDate(first)), first, `سال ${year}`);
  }
});

test('طول ماه‌ها درست است', () => {
  assert.equal(daysInMonth(1405, 1), 31); // شش ماه اول ۳۱ روز
  assert.equal(daysInMonth(1405, 6), 31);
  assert.equal(daysInMonth(1405, 7), 30); // ماه‌های میانی ۳۰ روز
  assert.equal(daysInMonth(1405, 11), 30);
});

test('اسفند در سال کبیسه ۳۰ روز و در غیر آن ۲۹ روز است', () => {
  // چرخه‌ی کبیسه پس از ۱۳۹۹ یک فاصله‌ی پنج‌ساله دارد: کبیسه‌ی بعدی ۱۴۰۴ است نه ۱۴۰۳
  assert.equal(isLeapYear(1399), true);
  assert.equal(isLeapYear(1403), false);
  assert.equal(isLeapYear(1404), true);
  assert.equal(isLeapYear(1405), false);
  assert.equal(isLeapYear(1408), true);

  assert.equal(daysInMonth(1404, 12), 30);
  assert.equal(daysInMonth(1405, 12), 29);
});

test('روز هفته با شنبه صفر شمرده می‌شود', () => {
  // ۱۴۰۵/۰۶/۲۸ شنبه است — همان چیزی که سایت رجا نشان می‌داد
  assert.equal(weekdayIndex({ year: 1405, month: 6, day: 28 }), 0);
});

test('قالب‌بندی صفر ابتدایی می‌گذارد', () => {
  assert.equal(formatJalali({ year: 1405, month: 6, day: 8 }), '1405/06/08');
});

test('پارس ارقام فارسی و لاتین', () => {
  assert.deepEqual(parseJalali('۱۴۰۵/۰۶/۲۸'), { year: 1405, month: 6, day: 28 });
  assert.deepEqual(parseJalali('1405/6/8'), { year: 1405, month: 6, day: 8 });
  assert.deepEqual(parseJalali('1405-06-28'), { year: 1405, month: 6, day: 28 });
});

test('تاریخ نامعتبر رد می‌شود', () => {
  assert.equal(parseJalali('28 شهریور'), null);
  assert.equal(parseJalali('1405/13/01'), null); // ماه ۱۳ نداریم
  assert.equal(parseJalali('1405/12/30'), null); // ۱۴۰۵ کبیسه نیست
  assert.deepEqual(parseJalali('1404/12/30'), { year: 1404, month: 12, day: 30 }); // ولی ۱۴۰۴ هست
  assert.equal(parseJalali(''), null);
});

test('جمع روز از مرز ماه و سال درست رد می‌شود', () => {
  assert.deepEqual(addDays({ year: 1405, month: 6, day: 31 }, 1), { year: 1405, month: 7, day: 1 });
  assert.deepEqual(addDays({ year: 1405, month: 12, day: 29 }, 1), { year: 1406, month: 1, day: 1 });
  assert.deepEqual(addDays({ year: 1406, month: 1, day: 1 }, -1), { year: 1405, month: 12, day: 29 });
  // سال کبیسه یک روز بیشتر دارد
  assert.deepEqual(addDays({ year: 1404, month: 12, day: 29 }, 1), { year: 1404, month: 12, day: 30 });
  assert.deepEqual(addDays({ year: 1404, month: 12, day: 30 }, 1), { year: 1405, month: 1, day: 1 });
});

test('فاصله‌ی دو تاریخ', () => {
  assert.equal(diffDays({ year: 1405, month: 6, day: 28 }, { year: 1405, month: 6, day: 30 }), 2);
  assert.equal(diffDays({ year: 1405, month: 1, day: 1 }, { year: 1406, month: 1, day: 1 }), 365);
});

test('مقایسه‌ی تاریخ‌ها', () => {
  const a = { year: 1405, month: 6, day: 28 };
  assert.equal(compareJalali(a, a), 0);
  assert.ok(compareJalali(a, { year: 1405, month: 6, day: 29 }) < 0);
  assert.ok(compareJalali(a, { year: 1404, month: 12, day: 29 }) > 0);
});
