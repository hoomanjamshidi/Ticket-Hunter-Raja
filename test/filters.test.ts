/** تست فیلترها و اولویت‌بندی — منطقی که تصمیم می‌گیرد کدام بلیت خریده شود. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { filtersSchema, rankingSchema, type TrainOffer } from '../src/config/schema.js';
import { evaluateOffer } from '../src/hunter/filters.js';
import { pickBest } from '../src/hunter/ranking.js';

/** یک نتیجه‌ی نمونه بر پایه‌ی همان قطار ۵۳۳ بندرعباس→اصفهان */
function offer(overrides: Partial<TrainOffer> = {}): TrainOffer {
  return {
    owner: 'رجا',
    salonTitle: '3ستاره4تخته البرز',
    salonType: 'کوپه ای 4 نفره',
    trainNumber: 533,
    fromStation: 'بندرعباس',
    toStation: 'اصفهان',
    departTime: '12:05',
    arriveTime: '04:55',
    priceRial: 11_700_000,
    availableSeats: 20,
    status: 'available',
    cardIndex: 0,
    date: '1405/06/28',
    ...overrides,
  };
}

const f = (partial: Record<string, unknown> = {}) => filtersSchema.parse(partial);

test('نتیجه‌ی بدون فیلتر پذیرفته می‌شود', () => {
  assert.equal(evaluateOffer(offer(), f(), 1).matches, true);
});

test('قطار تمام‌شده هرگز پذیرفته نمی‌شود', () => {
  const result = evaluateOffer(offer({ status: 'soldOut' }), f(), 1);
  assert.equal(result.matches, false);
  assert.equal(result.reason, 'notAvailable');
});

test('اگر ظرفیت کمتر از تعداد مسافران باشد رد می‌شود', () => {
  const result = evaluateOffer(offer({ availableSeats: 2 }), f(), 3);
  assert.equal(result.matches, false);
  assert.equal(result.reason, 'seats');
});

test('بازه‌ی ساعت حرکت اعمال می‌شود', () => {
  assert.equal(evaluateOffer(offer(), f({ departFrom: '10:00', departTo: '14:00' }), 1).matches, true);
  assert.equal(evaluateOffer(offer(), f({ departFrom: '15:00', departTo: '20:00' }), 1).matches, false);
});

test('بازه‌ی شبانه که از نیمه‌شب رد می‌شود درست کار می‌کند', () => {
  // قطار ۲۳:۳۰ باید در بازه‌ی ۲۲:۰۰ تا ۰۶:۰۰ بیفتد
  const night = offer({ departTime: '23:30' });
  assert.equal(evaluateOffer(night, f({ departFrom: '22:00', departTo: '06:00' }), 1).matches, true);
  // و ساعت ۰۴:۰۰ هم همین‌طور
  const dawn = offer({ departTime: '04:00' });
  assert.equal(evaluateOffer(dawn, f({ departFrom: '22:00', departTo: '06:00' }), 1).matches, true);
  // ولی ظهر نه
  assert.equal(evaluateOffer(offer(), f({ departFrom: '22:00', departTo: '06:00' }), 1).matches, false);
});

test('سقف قیمت اعمال می‌شود', () => {
  assert.equal(evaluateOffer(offer(), f({ maxPriceRial: 12_000_000 }), 1).matches, true);
  assert.equal(evaluateOffer(offer(), f({ maxPriceRial: 10_000_000 }), 1).matches, false);
});

test('تفاوت ی/ك عربی و فارسی مانع تطبیق نمی‌شود', () => {
  // کاربر با «ی» فارسی می‌نویسد ولی سایت گاهی «ي» عربی دارد
  const arabic = offer({ salonType: 'كوپه اي 4 نفره' });
  assert.equal(evaluateOffer(arabic, f({ salonTypes: ['کوپه ای 4 نفره'] }), 1).matches, true);
});

test('لیست سیاه شماره قطار مقدم بر لیست سفید است', () => {
  const filters = f({ trainNumbersInclude: [533], trainNumbersExclude: [533] });
  assert.equal(evaluateOffer(offer(), filters, 1).matches, false);
});

test('لیست سفید شماره قطار بقیه را رد می‌کند', () => {
  assert.equal(evaluateOffer(offer(), f({ trainNumbersInclude: [999] }), 1).matches, false);
  assert.equal(evaluateOffer(offer(), f({ trainNumbersInclude: [533, 999] }), 1).matches, true);
});

test('نتیجه‌ی بدون ساعت خوانا، وقتی بازه تعیین شده، رد می‌شود', () => {
  const broken = offer({ departTime: null });
  assert.equal(evaluateOffer(broken, f({ departFrom: '10:00' }), 1).matches, false);
  // ولی بدون بازه مشکلی ندارد
  assert.equal(evaluateOffer(broken, f(), 1).matches, true);
});

test('حالت firstFound همان اولی را برمی‌دارد', () => {
  const list = [offer({ priceRial: 9_000_000 }), offer({ priceRial: 1_000_000 })];
  const best = pickBest(list, rankingSchema.parse({ mode: 'firstFound' }));
  assert.equal(best?.priceRial, 9_000_000);
});

test('حالت priority/cheapest ارزان‌ترین را برمی‌دارد', () => {
  const list = [offer({ priceRial: 9_000_000 }), offer({ priceRial: 1_000_000 })];
  const best = pickBest(list, rankingSchema.parse({ mode: 'priority', by: 'cheapest' }));
  assert.equal(best?.priceRial, 1_000_000);
});

test('حالت closestToTime نزدیک‌ترین ساعت را برمی‌دارد، با در نظر گرفتن چرخش شبانه‌روز', () => {
  const list = [offer({ departTime: '08:00' }), offer({ departTime: '23:30' })];
  const best = pickBest(
    list,
    rankingSchema.parse({ mode: 'priority', by: 'closestToTime', preferredTime: '00:30' }),
  );
  // ۲۳:۳۰ یک ساعت با ۰۰:۳۰ فاصله دارد، ۰۸:۰۰ هفت‌ونیم ساعت
  assert.equal(best?.departTime, '23:30');
});

test('لیست خالی نتیجه‌ای ندارد', () => {
  assert.equal(pickBest([], rankingSchema.parse({})), null);
});
