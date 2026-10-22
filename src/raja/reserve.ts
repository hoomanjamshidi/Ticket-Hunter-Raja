/**
 * جریان رزرو: از کارت نتیجه تا صفحه‌ی درگاه بانک.
 *
 * ربات دقیقاً روی درگاه می‌ایستد و پرداخت را انجام نمی‌دهد — آنجا کنترل
 * به کاربر واگذار می‌شود.
 *
 * این جریان روی تب اصلی اجرا می‌شود (نه تب رصد) تا صفحه‌ای که کاربر تحویل
 * می‌گیرد همان پنجره‌ی پیش‌رو باشد.
 */
import type { Locator, Page } from 'playwright';
import type { Passenger, TrainOffer } from '../config/schema.js';
import { createLogger } from '../utils/logger.js';
import { snapshot } from './browser.js';
import { buildSearchUrl, type SearchUrlParams } from './searchUrl.js';
import { passengerForm as form, routes, search as sel, searchActions } from './selectors.js';

const log = createLogger('raja:reserve');

/** گام‌های جریان — برای گزارش دقیق در داشبورد */
export type ReserveStep =
  | 'openSearch'
  | 'selectTrain'
  | 'continue'
  | 'fillPassengers'
  | 'acceptTerms'
  | 'submitPayment'
  | 'gateway';

export interface ReserveOutcome {
  ok: boolean;
  /** آخرین گامی که با موفقیت انجام شد */
  step: ReserveStep;
  /** آدرس درگاه، اگر به آنجا رسیدیم */
  gatewayUrl?: string;
  /** پیام فارسی برای نمایش */
  message: string;
  screenshot?: string | null;
}

export interface ReserveOptions {
  offer: TrainOffer;
  searchParams: Omit<SearchUrlParams, 'date'>;
  passengers: Passenger[];
  contactMobile: string;
  /** پیش از کلیک روی «پرداخت» صدا زده می‌شود — برای بررسی کپچا */
  beforePayment?: () => Promise<boolean>;
  /** با شروع هر گام صدا زده می‌شود تا داشبورد پیشرفت را نشان دهد */
  onStep?: (step: ReserveStep) => void;
}

/** چقدر صبر کنیم تا صفحه‌ی درگاه بانک بالا بیاید */
const GATEWAY_TIMEOUT_MS = 45_000;

function fail(step: ReserveStep, message: string, shot: string | null): ReserveOutcome {
  return { ok: false, step, message, screenshot: shot };
}

/**
 * کارت مربوط به این پیشنهاد را پیدا می‌کند.
 *
 * از `cardIndex` استفاده نمی‌کنیم چون ترتیب نتایج بین دو بار بارگذاری ممکن
 * است عوض شود؛ به جایش با شماره‌ی قطار و ساعت حرکت تطبیق می‌دهیم که
 * ترکیب یکتایی است.
 */
async function findCard(page: Page, offer: TrainOffer): Promise<number> {
  const count = await page.locator(sel.card).count();

  for (let i = 0; i < count; i += 1) {
    const card = page.locator(sel.card).nth(i);
    const [numberText, timeText] = await Promise.all([
      card.locator(sel.trainNumber).textContent().catch(() => ''),
      card.locator(sel.departTime).textContent().catch(() => ''),
    ]);

    const sameTrain =
      offer.trainNumber !== null && (numberText ?? '').includes(String(offer.trainNumber));
    const sameTime = offer.departTime !== null && (timeText ?? '').includes(offer.departTime);

    if (sameTrain && sameTime) return i;
  }

  // اگر تطبیق دقیق نشد، به اندیس اولیه برمی‌گردیم
  return offer.cardIndex;
}

/**
 * یک فیلد را با تکیه بر برچسب کنارش پر می‌کند.
 *
 * فیلدهای فرم مسافر `id` ندارند، ولی هرکدام داخل یک `.input-group` با یک
 * برچسب متنی نشسته‌اند. برای چند مسافر، `occurrence` می‌گوید چندمین تکرار
 * آن برچسب مقصد ماست.
 */
async function fillByLabel(
  page: Page,
  label: string,
  value: string,
  occurrence: number,
): Promise<boolean> {
  const group = page.locator('.input-group', { hasText: label }).nth(occurrence);
  const input = group.locator('input').first();
  try {
    await input.fill(value, { timeout: 8_000 });
    return true;
  } catch {
    log.warn('پر کردن فیلد شکست خورد', { label, occurrence });
    return false;
  }
}

/**
 * کد «نوع سنی» در سایت رجا.
 *
 * انتخاب بر اساس value انجام می‌شود نه متن: متن گزینه‌ها ممکن است با فاصله
 * یا نیم‌فاصله‌ی متفاوت بیاید، ولی این کدها ثابت‌اند.
 */
const AGE_TYPE_VALUE: Record<Passenger['ageType'], string> = {
  'بزرگسال': '1',
  'خردسال': '2',
  'تبعه خارجی': '9',
};

/** یک گزینه‌ی منوی غذا */
export interface MealOption {
  value: string;
  text: string;
}

/**
 * از میان گزینه‌های غذا، مناسب‌ترین را انتخاب می‌کند.
 *
 * ⚠️ متن گزینه‌ی «بدون غذا» بین قطارها فرق می‌کند؛ روی بعضی قطارها فقط
 * `0 (0 )` نوشته شده. پس وقتی کاربر غذا نمی‌خواهد، به‌جای تطبیق متن،
 * گزینه‌ای را برمی‌داریم که قیمتش صفر است.
 *
 * جدا نگه داشتنش از DOM باعث می‌شود بشود مستقیم تستش کرد.
 */
export function chooseMeal(options: MealOption[], wanted: string): MealOption | null {
  if (options.length === 0) return null;

  const zeroPriced = options.find((option) => /\(\s*0\s*\)/.test(option.text));
  const noMeal = !wanted.trim() || wanted.includes('بدون غذا');
  if (noMeal) return zeroPriced ?? options[0]!;

  const target = wanted.trim();
  const exact = options.find((option) => option.text.includes(target));
  // اگر غذای خواسته‌شده روی این قطار نبود، بی‌غذا امن‌تر از غذای تصادفی است
  return exact ?? zeroPriced ?? options[0]!;
}

/** گزینه‌ی انتخاب‌شده را روی منوی غذا اعمال می‌کند. */
async function pickMeal(select: Locator, wanted: string): Promise<void> {
  const options = await select.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      text: (node as HTMLOptionElement).text.trim(),
    })),
  );

  const chosen = chooseMeal(options, wanted);
  if (!chosen) return;

  await select.selectOption(chosen.value).catch(() => {
    log.warn('انتخاب غذا شکست خورد', { wanted, chosen: chosen.text });
  });
}

/**
 * select های نوع سنی و غذا را با محتوایشان پیدا می‌کند.
 *
 * ⚠️ شمردن ترتیبی (`nth(index * 2)`) کار نمی‌کند: هنگام باز شدن صفحه فقط
 * select نوع سنی وجود دارد و منوی غذا کمی بعد اضافه می‌شود، پس اندیس‌ها
 * جابه‌جا می‌شوند. به‌جایش از روی گزینه‌ها تشخیص می‌دهیم — نوع سنی گزینه‌ی
 * «بزرگسال» دارد و غذا گزینه‌هایی با قیمت داخل پرانتز.
 */
async function findPassengerSelects(
  page: Page,
): Promise<{ age: Locator[]; meal: Locator[] }> {
  const selects = page.locator('select');
  const count = await selects.count();
  const age: Locator[] = [];
  const meal: Locator[] = [];

  for (let i = 0; i < count; i += 1) {
    const select = selects.nth(i);
    const options = await select.locator('option').allTextContents().catch(() => []);
    if (options.some((text) => text.includes('بزرگسال'))) age.push(select);
    else if (options.some((text) => /\(\s*\d+\s*\)/.test(text))) meal.push(select);
  }
  return { age, meal };
}

/**
 * فرم مسافران را پر می‌کند و نتیجه را راستی‌آزمایی می‌کند.
 *
 * در پایان مقدار فیلدها دوباره خوانده می‌شود. رجا ورودی نامعتبر (مثلاً کد
 * ملی اشتباه) را بی‌صدا **پاک می‌کند**؛ بدون این بررسی، ربات با فرم ناقص
 * تا دکمه‌ی پرداخت می‌رفت و خطای گنگ می‌گرفت.
 */
async function fillPassengers(page: Page, passengers: Passenger[]): Promise<string | null> {
  // منوی غذا با کمی تأخیر ساخته می‌شود؛ فرصت بده ولی گیر نکن
  await page.waitForTimeout(1_200);
  const selects = await findPassengerSelects(page);

  for (const [index, passenger] of passengers.entries()) {
    await setAgeType(selects.age[index], passenger);

    const mealSelect = selects.meal[index];
    if (mealSelect) await pickMeal(mealSelect, passenger.meal);

    await fillByLabel(page, 'کد ملی', passenger.nationalId, index);
    await fillBirthDate(page, passenger.birthDate, index);
    await page.locator(form.firstName).nth(index).fill(passenger.firstName).catch(() => undefined);
    await page.locator(form.lastName).nth(index).fill(passenger.lastName).catch(() => undefined);

    if (passenger.discountCode) {
      await fillByLabel(page, 'کد تخفیف', passenger.discountCode, index);
    }
  }

  // به Angular فرصت بده اعتبارسنجی‌اش را اجرا کند
  await page.waitForTimeout(800);

  return verifyPassengers(page, passengers);
}

/**
 * تاریخ تولد را پر می‌کند.
 *
 * اول با placeholder یکتا سراغش می‌رود؛ اگر رجا placeholder را عوض کرد،
 * به تطبیق برچسب برمی‌گردد.
 */
async function fillBirthDate(page: Page, value: string, occurrence: number): Promise<void> {
  const byPlaceholder = page.locator(form.birthDate).nth(occurrence);
  if ((await byPlaceholder.count()) > 0) {
    const done = await byPlaceholder
      .fill(value, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (done) return;
  }
  await fillByLabel(page, 'ت ت', value, occurrence);
}

/**
 * نوع سنی را تنظیم می‌کند.
 *
 * ⚠️ وقتی جستجو فقط برای یک نوع مسافر بوده، رجا این select را **غیرفعال**
 * می‌کند و مقدارش را خودش گذاشته است. تلاش برای عوض کردنش تا تایم‌اوت طول
 * می‌کشید و بی‌فایده بود؛ حالا فقط بررسی می‌کنیم مقدار همانی باشد که
 * انتظار داریم.
 */
async function setAgeType(select: Locator | undefined, passenger: Passenger): Promise<void> {
  if (!select) return;

  const wanted = AGE_TYPE_VALUE[passenger.ageType];
  const current = await select.inputValue().catch(() => '');
  if (current === wanted) return;

  if (!(await select.isEnabled().catch(() => false))) {
    log.warn('نوع سنی توسط رجا قفل شده و با پروفایل نمی‌خواند', {
      wanted: passenger.ageType,
      current,
    });
    return;
  }

  await select.selectOption(wanted, { timeout: 8_000 }).catch(() => {
    log.warn('انتخاب نوع سنی شکست خورد', { ageType: passenger.ageType });
  });
}

/**
 * بررسی می‌کند مقادیر واقعاً در فرم نشسته‌اند.
 * پیام خطای فارسی برمی‌گرداند، یا `null` اگر همه‌چیز درست باشد.
 */
async function verifyPassengers(page: Page, passengers: Passenger[]): Promise<string | null> {
  for (const [index, passenger] of passengers.entries()) {
    const who = `${passenger.firstName} ${passenger.lastName}`.trim();

    const nationalId = await readByLabel(page, 'کد ملی', index);
    if (!nationalId) {
      return `کد ملی «${who}» را رجا نپذیرفت. آن را در صفحه‌ی مسافران اصلاح کنید.`;
    }

    const birthDate = await page
      .locator(form.birthDate)
      .nth(index)
      .inputValue()
      .then((value) => value.trim())
      .catch(() => readByLabel(page, 'ت ت', index));
    if (!birthDate) {
      return `تاریخ تولد «${who}» را رجا نپذیرفت. آن را در صفحه‌ی مسافران اصلاح کنید.`;
    }

    const firstName = await page.locator(form.firstName).nth(index).inputValue().catch(() => '');
    const lastName = await page.locator(form.lastName).nth(index).inputValue().catch(() => '');
    if (!firstName.trim() || !lastName.trim()) {
      return `نام یا نام خانوادگی «${who}» در فرم رجا ثبت نشد.`;
    }
  }
  return null;
}

/** مقدار فعلی فیلدی که با برچسبش شناخته می‌شود. */
async function readByLabel(page: Page, label: string, occurrence: number): Promise<string> {
  const group = page.locator('.input-group', { hasText: label }).nth(occurrence);
  return group
    .locator('input')
    .first()
    .inputValue()
    .then((value) => value.trim())
    .catch(() => '');
}

/**
 * تیک «تأیید قوانین» را می‌زند و مطمئن می‌شود واقعاً خورده است.
 *
 * چون input اصلی پنهان است، اول روی برچسب کلیک می‌کنیم — همان کاری که
 * کاربر می‌کند و رویداد Angular را هم درست فعال می‌کند. اگر به هر دلیل
 * نشد، سراغ حالت اجباری می‌رویم. در هر حالت، نتیجه با خواندن وضعیت
 * واقعی چک‌باکس تأیید می‌شود، نه با فرض کردن.
 */
async function acceptTerms(page: Page): Promise<boolean> {
  const input = page.locator(form.termsCheckbox).first();
  const isChecked = (): Promise<boolean> => input.isChecked().catch(() => false);

  if (await isChecked()) return true;

  // راه اصلی: کلیک روی برچسبِ دیدنی
  const label = page.locator(form.termsLabel, { hasText: form.termsText }).first();
  if ((await label.count()) > 0) {
    await label.click({ timeout: 8_000 }).catch(() => undefined);
    if (await isChecked()) return true;
  }

  // برچسب بدون متن مورد انتظار؟ هر برچسب کنترل سفارشی را امتحان کن
  await page
    .locator(form.termsLabel)
    .first()
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  if (await isChecked()) return true;

  // آخرین تلاش: مستقیم روی خود input، با نادیده گرفتن نامرئی بودنش
  await input.check({ force: true, timeout: 5_000 }).catch(() => undefined);
  if (await isChecked()) return true;

  log.warn('زدن تیک قوانین با هیچ‌کدام از روش‌ها موفق نبود');
  return false;
}

/**
 * جریان کامل رزرو تا درگاه بانک.
 * هر گام تایم‌اوت و اسکرین‌شات دارد تا وقتی چیزی خراب شد بشود فهمید کجا.
 */
export async function reserveToGateway(
  page: Page,
  options: ReserveOptions,
): Promise<ReserveOutcome> {
  const { offer, searchParams, passengers, contactMobile } = options;
  const step = (name: ReserveStep): void => options.onStep?.(name);

  // ── گام ۱: باز کردن صفحه‌ی نتایج همان تاریخ ─────────────────────────────
  step('openSearch');
  const url = buildSearchUrl({ ...searchParams, date: offer.date });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator(sel.card).first().waitFor({ state: 'attached', timeout: 20_000 });
  } catch {
    return fail('openSearch', 'صفحه‌ی نتایج باز نشد.', await snapshot('open-search-failed'));
  }

  // ── گام ۲: انتخاب قطار ──────────────────────────────────────────────────
  step('selectTrain');
  const cardIndex = await findCard(page, offer);
  try {
    await page.locator(sel.card).nth(cardIndex).locator(sel.reserveButton).click({ timeout: 10_000 });
  } catch {
    // بلیت بین چک کردن و کلیک پریده — رایج‌ترین حالت شکست
    return fail('selectTrain', 'بلیت پیش از انتخاب فروخته شد.', await snapshot('select-failed'));
  }

  // ── گام ۳: ادامه‌ی خرید ─────────────────────────────────────────────────
  step('continue');
  try {
    await page.locator(searchActions.continue).first().click({ timeout: 10_000 });
    await page.waitForURL(`**${routes.registerTicket}**`, { timeout: 25_000 });
  } catch {
    return fail('continue', 'رفتن به صفحه‌ی مسافران انجام نشد.', await snapshot('continue-failed'));
  }

  log.info('صفحه‌ی مسافران باز شد', { train: offer.trainNumber, date: offer.date });

  // ── گام ۴: پر کردن مشخصات مسافران ───────────────────────────────────────
  step('fillPassengers');
  try {
    await page.locator(form.firstName).first().waitFor({ state: 'visible', timeout: 20_000 });
    const problem = await fillPassengers(page, passengers);
    if (problem) {
      return fail('fillPassengers', problem, await snapshot('passenger-rejected'));
    }
  } catch {
    return fail('fillPassengers', 'پر کردن فرم مسافران شکست خورد.', await snapshot('fill-failed'));
  }

  // ── گام ۵: شماره‌ی همراه و تیک قوانین ───────────────────────────────────
  if (contactMobile) {
    await fillByLabel(page, 'شماره تلفن همراه', contactMobile, 0);
  }
  if (!(await acceptTerms(page))) {
    return fail('acceptTerms', 'تیک تأیید قوانین زده نشد.', await snapshot('terms-failed'));
  }

  // ── گام ۶: بررسی کپچا پیش از پرداخت ─────────────────────────────────────
  if (options.beforePayment) {
    const clear = await options.beforePayment();
    if (!clear) {
      return fail('acceptTerms', 'کپچا حل نشد و جریان متوقف شد.', await snapshot('captcha'));
    }
  }

  // ── گام ۷: پرداخت — آخرین کاری که ربات انجام می‌دهد ─────────────────────
  step('submitPayment');
  await snapshot('before-payment');
  try {
    await page.locator(form.pay).first().click({ timeout: 10_000 });
  } catch {
    return fail('submitPayment', 'کلیک روی دکمه‌ی پرداخت انجام نشد.', await snapshot('pay-failed'));
  }

  // ── گام ۸: انتظار برای خروج از دامنه‌ی رجا (رسیدن به درگاه بانک) ────────
  try {
    await page.waitForURL((target) => !target.hostname.endsWith('raja.ir'), {
      timeout: GATEWAY_TIMEOUT_MS,
    });
  } catch {
    return fail(
      'submitPayment',
      'به درگاه بانک نرسیدیم. ممکن است فرم ایرادی داشته باشد.',
      await snapshot('gateway-timeout'),
    );
  }

  const gatewayUrl = page.url();
  log.info('به درگاه بانک رسیدیم — کنترل با کاربر است', { host: new URL(gatewayUrl).host });

  return {
    ok: true,
    step: 'gateway',
    gatewayUrl,
    message: 'وارد درگاه بانک شدیم. پرداخت را در مرورگر تکمیل کنید.',
    screenshot: await snapshot('gateway'),
  };
}
