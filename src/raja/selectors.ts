/**
 * تمام سلکتورهای سایت رجا، یکجا.
 *
 * ⚠️ این تنها فایلی است که به ظاهر سایت رجا وابسته است. اگر رجا قالبش را
 * عوض کرد، فقط همین‌جا باید اصلاح شود. هیچ سلکتوری در جای دیگری ننویسید.
 *
 * همه‌ی این‌ها با پیمودن دستی مسیر واقعی (جستجو → انتخاب → فرم مسافر) تأیید
 * شده‌اند. توضیح کامل در CLAUDE.md.
 */

export const RAJA_ORIGIN = 'https://www.raja.ir';

/** فرم ورود — روی هر صفحه‌ای در دسترس است */
export const auth = {
  /**
   * فرم ورود داخل یک dropdown جمع‌شده در هدر است و تا باز نشود
   * `#UserName` وجود دارد ولی `hidden` است. اول باید این دکمه زده شود.
   */
  loginToggle: '#dropdownForm1',
  username: '#UserName',
  password: '#Password',
  /** دکمه‌ی هدر که در حالت ورود، نام کاربر را نشان می‌دهد */
  headerUserButton: 'button.hedBtn.dropdown-toggle',
  /** کلیدهای localStorage که نشان می‌دهند سشن برقرار است */
  tokenKey: 'Access_Token',
  userFlagKey: 'LgUF',
} as const;

/** صفحه‌ی نتایج جستجو */
export const search = {
  /** کارت هر قطار */
  card: '.train-result',
  owner: '.owner-name',
  salonTitle: '.train-name',
  salonType: '.wagon-type',
  trainNumber: '.train-number',
  fromStation: '.start-station-name',
  toStation: '.end-station-name',
  /**
   * ظرف کامل گرفته می‌شود، نه span داخلی: هر ظرف هم برچسب
   * («حرکت از مبدا») و هم ساعت را دارد و `extractTime` ساعت را بیرون
   * می‌کشد. گرفتن span اول، برچسب را برمی‌گرداند نه ساعت را.
   */
  departTime: '.start-day',
  arriveTime: '.end-day',
  price: '.price',
  capacity: '.capacity-title .field-value',
  /** دکمه‌ی «رزرو بلیت» — وقتی کارت قابل خرید است */
  reserveButton: 'button.lock-btn',
  /**
   * حالت خالی: «برای مسیر رفت شما در این تاریخ قطار یافت نشد.»
   * بدون این، منتظر ماندن برای کارت‌هایی که هرگز نمی‌آیند تا تایم‌اوت طول می‌کشد.
   *
   * ⚠️ کلاس `alert-danger` را بنرهای اطلاعیه‌ی بالای سایت هم دارند، پس
   * حتماً باید متن هم بررسی شود وگرنه هر صفحه‌ای «خالی» به نظر می‌رسد.
   */
  emptyState: '.alert.alert-danger',
  emptyStateText: 'یافت نشد',
  /**
   * وقتی رجا زیر فشار است یا ما را محدود کرده، همین کلاس با این متن
   * ظاهر می‌شود. تفکیکش از حالت خالی حیاتی است: «قطار نیست» یک جواب
   * است، ولی «خطای سرویس» یعنی باید عقب بکشیم و بعداً دوباره بیاییم.
   */
  serviceErrorText: 'خطا در اتصال سرویس',
} as const;

/**
 * متن‌هایی که وضعیت کارت را مشخص می‌کنند.
 * رجا وضعیت را فقط با متن دکمه نشان می‌دهد، نه با کلاس یا data-attribute.
 */
export const statusText = {
  available: 'رزرو بلیت',
  selected: 'عدم انتخاب',
  soldOut: 'تمام شد',
  departed: 'حرکت کرده',
} as const;

/** دکمه‌هایی که بعد از انتخاب یک قطار ظاهر می‌شوند */
export const searchActions = {
  /** «ادامه خرید» — تمام‌عرض و سبز، زیر لیست نتایج */
  continue: 'button.btn-success.btn-block',
  /** «عدم انتخاب» — همان دکمه‌ی رزرو بعد از کلیک */
  deselect: 'button.btn-primary',
} as const;

/**
 * فرم مسافر در `/registerticket`.
 *
 * ⚠️ تقریباً هیچ فیلدی `id` ندارد. فقط نام و نام خانوادگی `name` دارند؛
 * بقیه با ترتیب ظاهرشدن در میان کنترل‌های visible پیدا می‌شوند.
 * اندیس‌ها روی صفحه‌ی واقعی شمرده شده‌اند.
 */
export const passengerForm = {
  firstName: 'input[name=pName]',
  lastName: 'input[name=pFamily]',
  /**
   * تاریخ تولد. برچسبش فقط «ت ت» است که برای تطبیق متنی خیلی کوتاه و
   * مستعد اشتباه است، ولی placeholder اش یکتاست.
   */
  birthDate: 'input[placeholder="1357/11/12"]',
  /**
   * تیک «صحت مشخصات و اطلاعات سفر را تایید می نمایم…».
   *
   * ⚠️ خود input با `opacity: 0` و `z-index: -1` پنهان شده (کنترل سفارشی
   * بوت‌استرپ)، پس `check()` پلی‌رایت روی آن شکست می‌خورد. باید روی
   * برچسبِ کنارش کلیک کرد؛ همان چیزی است که کاربر واقعی هم می‌بیند.
   *
   * چک‌باکس دیگرِ صفحه («از اتباع خارجی هستم») کلاس `inp-cbx` دارد و با
   * این سلکتور اشتباه گرفته نمی‌شود.
   */
  termsCheckbox: 'input[type=checkbox].custom-control-input',
  termsLabel: 'label.custom-control-label',
  /** بخشی از متن برچسب، برای اطمینان از اینکه سراغ تیک درست رفته‌ایم */
  termsText: 'صحت مشخصات',
  /** «انتخاب از مسافرین سابق» */
  previousPassengers: 'button.Ex-passenger',
  /** «خدمات رایگان» */
  freeServices: 'button.btn-info.btn-block',
  /** «پرداخت» — نقطه‌ی تحویل به کاربر */
  pay: 'button.btn-success.btn-block',
  /** مودال مسافرین سابق */
  modal: '.modal-dialog.modal-lg',

  /**
   * جای هر کنترل در میان کنترل‌های visible فرم.
   * ترتیب: نوع سنی، کد ملی، تاریخ تولد، نام، نام خانوادگی، غذا،
   * قیمت (فقط‌خواندنی)، کد تخفیف، [۸ بدون برچسب]، تیک قوانین، موبایل.
   */
  fieldIndex: {
    ageType: 0,
    nationalId: 1,
    birthDate: 2,
    firstName: 3,
    lastName: 4,
    meal: 5,
    price: 6,
    discountCode: 7,
    terms: 9,
    contactMobile: 10,
  },
} as const;

/**
 * نشانه‌های کپچا.
 * در پیمایش کامل مسیر هیچ‌وقت ظاهر نشد، ولی بک‌اند سرویسش را دارد.
 * ما کپچا را حل نمی‌کنیم؛ فقط تشخیص می‌دهیم تا کنترل را به کاربر بدهیم.
 */
export const captcha = {
  /** درخواستی که نشان می‌دهد رجا کپچا خواسته */
  requestPattern: 'GetRajaCaptcha',
  /** المان‌های احتمالی کپچا روی صفحه */
  imageSelectors: ['img[src*="aptcha"]', '[class*="aptcha"]', '[id*="aptcha"]'].join(', '),
} as const;

/** مسیرهای مهم اپ Angular رجا */
export const routes = {
  home: '/',
  search: '/search',
  registerTicket: '/registerticket',
  payment: '/payment',
  callback: '/callback',
  stationsJson: '/assets/File/station.json',
} as const;
