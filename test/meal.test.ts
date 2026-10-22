/**
 * تست انتخاب گزینه‌ی غذا.
 *
 * متن گزینه‌ها بین قطارهای مختلف فرق می‌کند؛ این تست‌ها همان حالت‌هایی را
 * پوشش می‌دهند که روی سایت واقعی دیده شدند.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { chooseMeal } from '../src/raja/reserve.js';

/** همان چیزی که روی قطار ۶۲۲ دیده شد — «بدون غذا» اصلاً نوشته نشده */
const terse = [
  { value: '105', text: '0 (0 )' },
  { value: '3472', text: 'چلوجوجه كباب (4850000 )' },
  { value: '3474', text: 'خوراك مرغ (4800000 )' },
];

/** حالت رایج‌تر با برچسب کامل */
const labelled = [
  { value: '1', text: 'بدون غذا (0 )' },
  { value: '2', text: 'زرشك پلو با مرغ (4830000 )' },
  { value: '3', text: 'چلوكباب كوبيده (4760000 )' },
];

test('وقتی غذا نمی‌خواهیم، گزینه‌ی رایگان انتخاب می‌شود', () => {
  assert.equal(chooseMeal(terse, 'بدون غذا')?.value, '105');
  assert.equal(chooseMeal(labelled, 'بدون غذا')?.value, '1');
});

test('رشته‌ی خالی هم یعنی بدون غذا', () => {
  assert.equal(chooseMeal(terse, '')?.value, '105');
  assert.equal(chooseMeal(terse, '   ')?.value, '105');
});

test('غذای خواسته‌شده با تطبیق بخشی پیدا می‌شود', () => {
  assert.equal(chooseMeal(labelled, 'زرشك پلو')?.value, '2');
  assert.equal(chooseMeal(terse, 'چلوجوجه')?.value, '3472');
});

test('اگر غذای خواسته‌شده روی این قطار نبود، بی‌غذا انتخاب می‌شود نه غذای تصادفی', () => {
  // «زرشک پلو» روی قطار ۶۲۲ وجود ندارد
  assert.equal(chooseMeal(terse, 'زرشك پلو')?.value, '105');
});

test('منوی خالی نتیجه‌ای ندارد', () => {
  assert.equal(chooseMeal([], 'بدون غذا'), null);
});

test('اگر هیچ گزینه‌ی رایگانی نبود، اولی برداشته می‌شود', () => {
  const paidOnly = [{ value: '9', text: 'چلوكباب (500000 )' }];
  assert.equal(chooseMeal(paidOnly, 'بدون غذا')?.value, '9');
});
