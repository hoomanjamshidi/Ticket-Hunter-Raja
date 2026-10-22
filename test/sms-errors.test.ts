/** تست نگاشت پاسخ‌های ملی پیامک */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { describeResponse, isSuccess, suggestsPatternMode } from '../src/notify/errors.js';

test('recId بیش از ۱۵ رقم یعنی موفق', () => {
  assert.equal(isSuccess('1234567890123456'), true);
  assert.equal(isSuccess('123456789012345'), false); // ۱۵ رقم، هنوز کافی نیست
  assert.equal(isSuccess('0'), false);
  assert.equal(isSuccess('-110'), false);
});

test('کدهای مشترک به فارسی ترجمه می‌شوند', () => {
  assert.match(describeResponse('0', 'simple'), /نام کاربری یا رمز/);
  assert.match(describeResponse('2', 'pattern'), /اعتبار/);
});

test('کد -110 به ApiKey راهنمایی می‌کند', () => {
  assert.match(describeResponse('-110', 'simple'), /ApiKey/);
});

test('کدهای هم‌نام در دو حالت معنای متفاوت دارند', () => {
  // در حالت simple کد ۱۹ تعریف نشده، در حالت pattern یعنی محدودیت ساعتی
  assert.match(describeResponse('19', 'pattern'), /محدودیت ساعتی/);
  // کد -5 فقط در حالت الگو معنا دارد
  assert.match(describeResponse('-5', 'pattern'), /متغیرها/);
});

test('کد ۳۵ سوییچ به حالت الگو را پیشنهاد می‌کند', () => {
  assert.equal(suggestsPatternMode('35', 'simple'), true);
  assert.match(describeResponse('35', 'simple'), /لیست سیاه/);
  // در حالت الگو دیگر پیشنهادی ندارد چون همان‌جاست
  assert.equal(suggestsPatternMode('35', 'pattern'), false);
});

test('کد ناشناخته پیام عمومی می‌دهد نه خطا', () => {
  assert.match(describeResponse('999', 'simple'), /ناشناخته/);
});
