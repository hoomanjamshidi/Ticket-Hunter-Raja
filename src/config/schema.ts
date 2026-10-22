/**
 * مدل داده‌ی مرکزی پروژه.
 *
 * هر «رصد» (Watch) یعنی: این مسیر، در این تاریخ‌ها، با این فیلترها را بپا؛
 * هرچه پیدا شد تا درگاه بانک ببر و خبرم کن.
 */
import { z } from 'zod';

// ─── تنظیمات اجرایی قابل ویرایش از پنل ────────────────────────────────────

export const smsModeSchema = z.enum(['simple', 'pattern']);

export const runtimeSettingsSchema = z.object({
  rajaUsername: z.string().default(''),
  rajaPassword: z.string().default(''),
  smsMode: smsModeSchema.default('simple'),
  smsUsername: z.string().default(''),
  smsPassword: z.string().default(''),
  smsFrom: z.string().default(''),
  smsBodyId: z.string().default(''),
  notifyMobile: z.string().default(''),
  headless: z.boolean().default(false),
  /**
   * پروکسی مرورگر خودکار.
   *
   * سایت رجا فقط از داخل ایران بالا می‌آید؛ اگر سرور جای دیگری اجرا شود
   * باید ترافیک مرورگر از یک پروکسی رد شود. خالی یعنی بدون پروکسی.
   * قالب: `http://host:port` یا `socks5://host:port`
   */
  proxyServer: z.string().default(''),
  proxyUsername: z.string().default(''),
  proxyPassword: z.string().default(''),
});

export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

/**
 * همه‌ی فیلدها اختیاری‌اند تا رمز خالی در فرم به معنی «بدون تغییر» باشد.
 * ارسال صریح رشته‌ی خالی از API همچنان می‌تواند مقدار ذخیره‌شده را پاک کند.
 */
export const runtimeSettingsUpdateSchema = z.object({
  raja: z
    .object({
      username: z.string().trim().max(200).optional(),
      password: z.string().max(500).optional(),
    })
    .optional(),
  sms: z
    .object({
      mode: smsModeSchema.optional(),
      username: z.string().trim().max(200).optional(),
      password: z.string().max(500).optional(),
      from: z.string().trim().max(100).optional(),
      bodyId: z.string().trim().max(100).optional(),
      notifyMobile: z.string().trim().max(30).optional(),
    })
    .optional(),
  headless: z.boolean().optional(),
  proxy: z
    .object({
      server: z.string().trim().max(300).optional(),
      username: z.string().trim().max(200).optional(),
      password: z.string().max(500).optional(),
    })
    .optional(),
});

export type RuntimeSettingsUpdate = z.infer<typeof runtimeSettingsUpdateSchema>;

// ─── فیلترها ────────────────────────────────────────────────────────────────

/** ساعت به شکل `HH:MM` */
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'ساعت باید به شکل HH:MM باشد');

export const filtersSchema = z.object({
  /** بازه‌ی ساعت حرکت — هر دو سر اختیاری‌اند */
  departFrom: timeSchema.optional(),
  departTo: timeSchema.optional(),
  /** بازه‌ی ساعت رسیدن به مقصد */
  arriveFrom: timeSchema.optional(),
  arriveTo: timeSchema.optional(),
  /** بازه‌ی قیمت به ریال */
  minPriceRial: z.number().int().nonnegative().optional(),
  maxPriceRial: z.number().int().positive().optional(),
  /** تطبیق «شامل بودن» روی نوع سالن، مثلاً «کوپه ای 4 نفره» */
  salonTypes: z.array(z.string().min(1)).default([]),
  /** تطبیق «شامل بودن» روی عنوان سالن، مثلاً «البرز» */
  salonTitles: z.array(z.string().min(1)).default([]),
  /** نام شرکت مالک، مثلاً «رجا» یا «ريل ترابر سبا» */
  owners: z.array(z.string().min(1)).default([]),
  /** اگر پر باشد فقط همین شماره قطارها پذیرفته می‌شوند */
  trainNumbersInclude: z.array(z.number().int().positive()).default([]),
  /** این شماره قطارها هرگز انتخاب نمی‌شوند */
  trainNumbersExclude: z.array(z.number().int().positive()).default([]),
  /**
   * حداقل صندلی خالی. اگر تعیین نشود، برابر تعداد مسافران watch در نظر
   * گرفته می‌شود — چون رزرو ناقص به درد نمی‌خورد.
   */
  minSeats: z.number().int().positive().optional(),
});

export type WatchFilters = z.infer<typeof filtersSchema>;

// ─── زمان‌بندی ──────────────────────────────────────────────────────────────

export const scheduleSchema = z.object({
  /**
   * `fixed`  — فاصله‌ی ثابت با کمی jitter
   * `smart`  — نزدیک ساعت‌های آزادسازی بلیت استردادی تندتر می‌شود
   */
  mode: z.enum(['fixed', 'smart']).default('smart'),
  /** فاصله‌ی پایه در حالت fixed (ثانیه) */
  baseIntervalSec: z.number().int().min(5).max(3600).default(30),
  /** فاصله در «ساعت‌های طلایی» حالت smart */
  burstIntervalSec: z.number().int().min(5).max(600).default(10),
  /** فاصله در بقیه‌ی ساعت‌ها در حالت smart */
  idleIntervalSec: z.number().int().min(10).max(3600).default(60),
  /**
   * ساعت‌هایی که رجا بلیت استردادی به لیست اضافه می‌کند.
   * سایت خودش اعلام کرده: ۹، ۱۲، ۱۵، ۱۷ و ۱۹.
   */
  burstHours: z.array(z.number().int().min(0).max(23)).default([9, 12, 15, 17, 19]),
  /** پنجره‌ی دقیقه‌ای اطراف هر ساعت طلایی */
  burstWindowMin: z.number().int().min(1).max(60).default(2),
  /** رصد فقط بین این دو ساعت انجام شود (`HH:MM`) — اختیاری */
  activeFrom: timeSchema.optional(),
  activeTo: timeSchema.optional(),
  /** سقف مدت اجرا؛ صفر یعنی بی‌نهایت */
  maxRuntimeMin: z.number().int().min(0).default(0),
  /** بعد از رسیدن به درگاه، رصد متوقف شود */
  stopOnSuccess: z.boolean().default(true),
});

export type WatchSchedule = z.infer<typeof scheduleSchema>;

// ─── اولویت انتخاب قطار ─────────────────────────────────────────────────────

export const rankingSchema = z.object({
  /**
   * `firstFound` — هر قطاری که زودتر فیلترها را پاس کرد (سریع‌ترین)
   * `priority`   — همه را جمع کن، بعد بر اساس معیار زیر بهترین را بردار
   */
  mode: z.enum(['firstFound', 'priority']).default('firstFound'),
  by: z.enum(['cheapest', 'closestToTime', 'trainOrder']).default('cheapest'),
  /** مبنای معیار `closestToTime` */
  preferredTime: timeSchema.optional(),
  /** ترتیب دلخواه شماره قطارها برای معیار `trainOrder` */
  trainOrder: z.array(z.number().int().positive()).default([]),
});

export type WatchRanking = z.infer<typeof rankingSchema>;

// ─── مسافر ──────────────────────────────────────────────────────────────────

export const passengerSchema = z.object({
  id: z.number().int().optional(),
  firstName: z.string().min(1, 'نام لازم است'),
  lastName: z.string().min(1, 'نام خانوادگی لازم است'),
  /** کد ملی ۱۰ رقمی یا شماره پاسپورت برای اتباع خارجی */
  nationalId: z.string().min(4, 'کد ملی یا شماره پاسپورت لازم است'),
  /** تاریخ تولد شمسی `YYYY/MM/DD` */
  birthDate: z.string().min(8, 'تاریخ تولد لازم است'),
  /** برچسب دقیقاً مطابق گزینه‌های سایت رجا */
  ageType: z.enum(['بزرگسال', 'خردسال', 'تبعه خارجی']).default('بزرگسال'),
  /** متن گزینه‌ی غذا؛ پیش‌فرض بدون غذا */
  meal: z.string().default('بدون غذا'),
  /** کد تخفیف اختصاصی این مسافر، اگر دارد */
  discountCode: z.string().default(''),
});

export type Passenger = z.infer<typeof passengerSchema>;

// ─── رصد ────────────────────────────────────────────────────────────────────

export const watchStatusSchema = z.enum([
  'idle', // ساخته شده ولی شروع نشده
  'running', // در حال رصد
  'paused', // کاربر متوقف کرده
  'awaitingUser', // کپچا یا درگاه — منتظر دخالت کاربر
  'succeeded', // به درگاه بانک رسید
  'failed', // خطای متوقف‌کننده
]);

export type WatchStatus = z.infer<typeof watchStatusSchema>;

export const watchInputSchema = z.object({
  name: z.string().min(1, 'یک نام برای این رصد بگذارید'),
  fromStationCode: z.number().int().positive(),
  toStationCode: z.number().int().positive(),
  /** تاریخ‌های شمسی `YYYY/MM/DD`؛ بازه در لحظه‌ی ذخیره باز می‌شود */
  dates: z.array(z.string()).min(1, 'حداقل یک تاریخ لازم است'),
  adult: z.number().int().min(0).default(1),
  child: z.number().int().min(0).default(0),
  infant: z.number().int().min(0).default(0),
  /**
   * پارامتر `tickettype` در URL جستجو. مقدار پیش‌فرض سایت `Family` است.
   * به صورت رشته نگه داشته می‌شود تا اگر رجا گزینه‌ی تازه‌ای اضافه کرد نشکند.
   */
  ticketType: z.string().default('Family'),
  /** چک‌باکس «کوپه دربست باشد» */
  charterCoupe: z.boolean().default(false),
  filters: filtersSchema.default({}),
  schedule: scheduleSchema.default({}),
  ranking: rankingSchema.default({}),
  /** فرم مسافر از کجا پر شود */
  passengerFillMode: z.enum(['profile', 'previousPassengers', 'auto']).default('profile'),
  /** پروفایل‌هایی که به ترتیب در فرم نشانده می‌شوند */
  passengerIds: z.array(z.number().int()).default([]),
  /** شماره‌ی همراهی که در فرم رجا وارد می‌شود */
  contactMobile: z.string().default(''),
});

export type WatchInput = z.infer<typeof watchInputSchema>;

export interface Watch extends WatchInput {
  id: number;
  status: WatchStatus;
  createdAt: string;
  /** آخرین چرخه‌ی رصد */
  lastRunAt: string | null;
  /** تعداد چرخه‌های انجام‌شده */
  runCount: number;
  /** پیام آخرین خطا، اگر وضعیت failed باشد */
  lastError: string | null;
}

/** مجموع مسافران یک رصد — مبنای «حداقل صندلی لازم» */
export function totalPassengers(watch: Pick<WatchInput, 'adult' | 'child' | 'infant'>): number {
  return watch.adult + watch.child + watch.infant;
}

// ─── یک بلیت پیداشده ────────────────────────────────────────────────────────

/** وضعیت دکمه‌ی کارت در صفحه‌ی نتایج رجا */
export type OfferStatus = 'available' | 'selected' | 'soldOut' | 'departed' | 'unknown';

/** یک ردیف از صفحه‌ی نتایج، پس از پارس شدن */
export interface TrainOffer {
  owner: string;
  salonTitle: string;
  salonType: string;
  trainNumber: number | null;
  fromStation: string;
  toStation: string;
  /** `HH:MM` */
  departTime: string | null;
  arriveTime: string | null;
  priceRial: number | null;
  availableSeats: number | null;
  status: OfferStatus;
  /** جای این کارت در صفحه — برای کلیک کردن روی همان */
  cardIndex: number;
  /** تاریخ شمسی این نتیجه، چون یک چرخه چند تاریخ را می‌گردد */
  date: string;
}
