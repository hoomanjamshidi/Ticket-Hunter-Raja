/**
 * کشوی ساخت/ویرایش رصد.
 *
 * بخش «مسیر و تاریخ» باز است و بقیه جمع‌شده‌اند — کاربر تازه‌وارد فقط سه
 * فیلد می‌بیند، ولی همه‌ی فیلترها یک کلیک فاصله دارند.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { api, type Passenger, type Station, type Watch } from '../lib/api';
import { Button, Field } from './ui';
import { DatePicker } from './DatePicker';
import { compareJalali, diffDays, parseJalali } from '../lib/jalali';
import './WatchForm.css';

/** حالت فرم — همه چیز رشته است تا ورودی کاربر دست‌نخورده بماند. */
interface FormState {
  name: string;
  fromStationCode: string;
  toStationCode: string;
  dateFrom: string;
  dateTo: string;
  adult: string;
  child: string;
  infant: string;
  ticketType: string;
  charterCoupe: boolean;
  contactMobile: string;
  passengerIds: number[];
  passengerFillMode: string;
  // فیلترها
  departFrom: string;
  departTo: string;
  arriveFrom: string;
  arriveTo: string;
  maxPriceRial: string;
  minPriceRial: string;
  salonTypes: string;
  salonTitles: string;
  owners: string;
  trainNumbersInclude: string;
  trainNumbersExclude: string;
  minSeats: string;
  // زمان‌بندی
  scheduleMode: string;
  baseIntervalSec: string;
  burstIntervalSec: string;
  idleIntervalSec: string;
  activeFrom: string;
  activeTo: string;
  maxRuntimeMin: string;
  stopOnSuccess: boolean;
  // اولویت
  rankingMode: string;
  rankingBy: string;
  preferredTime: string;
  trainOrder: string;
}

function initial(watch: Watch | null): FormState {
  const f = (watch?.filters ?? {}) as Record<string, unknown>;
  const s = (watch?.schedule ?? {}) as Record<string, unknown>;
  const r = (watch?.ranking ?? {}) as Record<string, unknown>;
  const list = (value: unknown): string => (Array.isArray(value) ? value.join('، ') : '');

  return {
    name: watch?.name ?? '',
    fromStationCode: watch ? String(watch.fromStationCode) : '',
    toStationCode: watch ? String(watch.toStationCode) : '',
    dateFrom: watch?.dates[0] ?? '',
    dateTo: watch?.dates[watch.dates.length - 1] ?? '',
    adult: String(watch?.adult ?? 1),
    child: String(watch?.child ?? 0),
    infant: String(watch?.infant ?? 0),
    ticketType: watch?.ticketType ?? 'Family',
    charterCoupe: watch?.charterCoupe ?? false,
    contactMobile: watch?.contactMobile ?? '',
    passengerIds: watch?.passengerIds ?? [],
    passengerFillMode: watch?.passengerFillMode ?? 'profile',
    departFrom: (f.departFrom as string) ?? '',
    departTo: (f.departTo as string) ?? '',
    arriveFrom: (f.arriveFrom as string) ?? '',
    arriveTo: (f.arriveTo as string) ?? '',
    maxPriceRial: f.maxPriceRial ? String(f.maxPriceRial) : '',
    minPriceRial: f.minPriceRial ? String(f.minPriceRial) : '',
    salonTypes: list(f.salonTypes),
    salonTitles: list(f.salonTitles),
    owners: list(f.owners),
    trainNumbersInclude: list(f.trainNumbersInclude),
    trainNumbersExclude: list(f.trainNumbersExclude),
    minSeats: f.minSeats ? String(f.minSeats) : '',
    scheduleMode: (s.mode as string) ?? 'smart',
    baseIntervalSec: String(s.baseIntervalSec ?? 30),
    burstIntervalSec: String(s.burstIntervalSec ?? 10),
    idleIntervalSec: String(s.idleIntervalSec ?? 60),
    activeFrom: (s.activeFrom as string) ?? '',
    activeTo: (s.activeTo as string) ?? '',
    maxRuntimeMin: String(s.maxRuntimeMin ?? 0),
    stopOnSuccess: (s.stopOnSuccess as boolean) ?? true,
    rankingMode: (r.mode as string) ?? 'firstFound',
    rankingBy: (r.by as string) ?? 'cheapest',
    preferredTime: (r.preferredTime as string) ?? '',
    trainOrder: list(r.trainOrder),
  };
}

/** «رجا، فدک» → ['رجا', 'فدک'] */
function splitList(value: string): string[] {
  return value
    .split(/[،,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitNumbers(value: string): number[] {
  return splitList(value)
    .map((item) => Number(item.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** فیلدهای خالی حذف می‌شوند تا zod مقدار پیش‌فرض را بگذارد. */
function optionalTime(value: string): string | undefined {
  return /^\d{2}:\d{2}$/.test(value) ? value : undefined;
}

function optionalNumber(value: string): number | undefined {
  const n = Number(value);
  return value.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** خطاهای هر فیلد؛ کلید همان نام فیلد در `FormState` است. */
type FieldErrors = Partial<Record<keyof FormState, string>>;

/** هر فیلد در کدام بخش جمع‌شونده است — برای باز کردن خودکار هنگام خطا. */
const SECTION_OF: Partial<Record<keyof FormState, string>> = {
  name: 'route',
  fromStationCode: 'route',
  toStationCode: 'route',
  dateFrom: 'route',
  dateTo: 'route',
  adult: 'route',
  contactMobile: 'passengers',
  passengerIds: 'passengers',
  departFrom: 'filters',
  departTo: 'filters',
  arriveFrom: 'filters',
  arriveTo: 'filters',
  maxPriceRial: 'filters',
  activeFrom: 'schedule',
  activeTo: 'schedule',
  preferredTime: 'ranking',
};

/** سقف تعداد روزهای یک رصد — هر روز یک بارگذاری صفحه است و رجا محدودیت نرخ دارد. */
const MAX_DATES = 14;

/**
 * اعتبارسنجی کامل فرم پیش از ارسال.
 *
 * پیش‌تر همه‌چیز به سرور می‌رفت و پیام‌هایی مثل
 * «fromStationCode: Number must be greater than 0» برمی‌گشت که برای کاربر
 * بی‌معنا بود. حالا خطاها فارسی‌اند و کنار همان فیلد می‌نشینند.
 */
function validate(state: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!state.name.trim()) errors.name = 'یک نام برای این رصد بگذارید.';
  if (!state.fromStationCode) errors.fromStationCode = 'ایستگاه مبدا را انتخاب کنید.';
  if (!state.toStationCode) errors.toStationCode = 'ایستگاه مقصد را انتخاب کنید.';

  if (
    state.fromStationCode &&
    state.toStationCode &&
    state.fromStationCode === state.toStationCode
  ) {
    errors.toStationCode = 'مبدا و مقصد نمی‌توانند یکی باشند.';
  }

  const from = parseJalali(state.dateFrom);
  if (!state.dateFrom.trim()) {
    errors.dateFrom = 'تاریخ رفت را انتخاب کنید.';
  } else if (!from) {
    errors.dateFrom = 'تاریخ نامعتبر است. از تقویم انتخاب کنید.';
  }

  if (state.dateTo.trim()) {
    const to = parseJalali(state.dateTo);
    if (!to) {
      errors.dateTo = 'تاریخ نامعتبر است. از تقویم انتخاب کنید.';
    } else if (from && compareJalali(to, from) < 0) {
      errors.dateTo = 'تاریخ پایان نباید پیش از تاریخ شروع باشد.';
    } else if (from && diffDays(from, to) + 1 > MAX_DATES) {
      errors.dateTo = `حداکثر ${toPersian(MAX_DATES)} روز؛ بازه‌ی بلندتر باعث محدود شدن از سوی رجا می‌شود.`;
    }
  }

  const passengers =
    (Number(state.adult) || 0) + (Number(state.child) || 0) + (Number(state.infant) || 0);
  if (passengers < 1) errors.adult = 'حداقل یک مسافر لازم است.';

  /*
   * بدون پروفایل مسافر، رصد تا لحظه‌ی پیدا شدن بلیت درست کار می‌کند و
   * دقیقاً همان‌جا شکست می‌خورد — بدترین زمان ممکن. پس همین اول بگیریمش.
   */
  if (state.passengerFillMode !== 'previousPassengers' && state.passengerIds.length === 0) {
    errors.passengerIds = 'حداقل یک پروفایل مسافر انتخاب کنید، وگرنه لحظه‌ی رزرو کار متوقف می‌شود.';
  } else if (
    state.passengerIds.length > 0 &&
    state.passengerIds.length !== passengers
  ) {
    errors.passengerIds = `تعداد مسافران ${toPersian(passengers)} نفر است ولی ${toPersian(state.passengerIds.length)} پروفایل انتخاب شده.`;
  }

  if (state.contactMobile.trim() && !/^0\d{10}$/.test(toLatin(state.contactMobile))) {
    errors.contactMobile = 'شماره همراه باید ۱۱ رقم و با ۰ شروع شود.';
  }

  // ساعت‌ها اگر پر شده‌اند باید قالب درست داشته باشند
  const times: [keyof FormState, string][] = [
    ['departFrom', state.departFrom],
    ['departTo', state.departTo],
    ['arriveFrom', state.arriveFrom],
    ['arriveTo', state.arriveTo],
    ['activeFrom', state.activeFrom],
    ['activeTo', state.activeTo],
    ['preferredTime', state.preferredTime],
  ];
  for (const [key, value] of times) {
    if (value.trim() && !/^\d{2}:\d{2}$/.test(toLatin(value))) {
      errors[key] = 'ساعت را به شکل ۰۸:۳۰ وارد کنید.';
    }
  }

  const min = Number(state.minPriceRial);
  const max = Number(state.maxPriceRial);
  if (state.minPriceRial.trim() && state.maxPriceRial.trim() && min > max) {
    errors.maxPriceRial = 'حداکثر قیمت نباید از حداقل کمتر باشد.';
  }

  if (state.rankingMode === 'priority' && state.rankingBy === 'closestToTime' && !state.preferredTime.trim()) {
    errors.preferredTime = 'برای این معیار، ساعت دلخواه لازم است.';
  }

  return errors;
}

/** ارقام لاتین را برای نمایش در پیام‌ها به فارسی می‌برد. */
function toPersian(value: number | string): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}

/** ارقام فارسی را برای اعتبارسنجی به لاتین برمی‌گرداند. */
function toLatin(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function WatchForm({
  watch,
  onClose,
  onSaved,
}: {
  watch: Watch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<FormState>(() => initial(watch));
  const [stations, setStations] = useState<Station[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.stations().then(setStations).catch(() => undefined);
    void api.passengers().then(setPassengers).catch(() => undefined);
  }, []);

  /** با هر تغییر، خطای همان فیلد پاک می‌شود تا کاربر حس کند اصلاح شد. */
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => (previous[key] ? { ...previous, [key]: undefined } : previous));
  };

  async function submit(): Promise<void> {
    const found = validate(state);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // بخش جمع‌شده‌ای که خطا دارد را باز کن، وگرنه کاربر خطا را نمی‌بیند
      const first = Object.keys(found)[0] as keyof FormState;
      openSectionFor(first);
      setError('چند مورد را باید اصلاح کنید؛ فیلدهای مشخص‌شده را ببینید.');
      return;
    }

    setSaving(true);
    setError(null);

    const body = {
      name: state.name,
      fromStationCode: Number(state.fromStationCode),
      toStationCode: Number(state.toStationCode),
      dateFrom: state.dateFrom,
      dateTo: state.dateTo || state.dateFrom,
      dates: [],
      adult: Number(state.adult) || 0,
      child: Number(state.child) || 0,
      infant: Number(state.infant) || 0,
      ticketType: state.ticketType,
      charterCoupe: state.charterCoupe,
      contactMobile: state.contactMobile,
      passengerIds: state.passengerIds,
      passengerFillMode: state.passengerFillMode,
      filters: {
        departFrom: optionalTime(state.departFrom),
        departTo: optionalTime(state.departTo),
        arriveFrom: optionalTime(state.arriveFrom),
        arriveTo: optionalTime(state.arriveTo),
        minPriceRial: optionalNumber(state.minPriceRial),
        maxPriceRial: optionalNumber(state.maxPriceRial),
        salonTypes: splitList(state.salonTypes),
        salonTitles: splitList(state.salonTitles),
        owners: splitList(state.owners),
        trainNumbersInclude: splitNumbers(state.trainNumbersInclude),
        trainNumbersExclude: splitNumbers(state.trainNumbersExclude),
        minSeats: optionalNumber(state.minSeats),
      },
      schedule: {
        mode: state.scheduleMode,
        baseIntervalSec: Number(state.baseIntervalSec) || 30,
        burstIntervalSec: Number(state.burstIntervalSec) || 10,
        idleIntervalSec: Number(state.idleIntervalSec) || 60,
        activeFrom: optionalTime(state.activeFrom),
        activeTo: optionalTime(state.activeTo),
        maxRuntimeMin: Number(state.maxRuntimeMin) || 0,
        stopOnSuccess: state.stopOnSuccess,
      },
      ranking: {
        mode: state.rankingMode,
        by: state.rankingBy,
        preferredTime: optionalTime(state.preferredTime),
        trainOrder: splitNumbers(state.trainOrder),
      },
    };

    try {
      if (watch) await api.updateWatch(watch.id, body);
      else await api.createWatch(body);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  /**
   * بخش جمع‌شده‌ای که فیلد خطادار در آن است را باز می‌کند.
   * بدون این، خطای یک فیلتر پیشرفته پشت بخش بسته پنهان می‌ماند.
   */
  function openSectionFor(field: keyof FormState): void {
    const section = SECTION_OF[field];
    if (!section) return;
    const element = document.querySelector<HTMLDetailsElement>(`details[data-section="${section}"]`);
    if (element) {
      element.open = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={watch ? 'ویرایش رصد' : 'رصد جدید'}
      >
        <header className="drawer-head">
          <h2>{watch ? 'ویرایش رصد' : 'رصد جدید'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="بستن">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body">
          {error && <p className="page-error" role="alert">{error}</p>}

          {/* ── مسیر و تاریخ: همیشه باز ─────────────────────────────── */}
          <Section title="مسیر و تاریخ" id="route" open>
            <Field label="نام رصد" error={errors.name}>
              <input
                value={state.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="مثلاً بندرعباس به اصفهان"
              />
            </Field>

            <div className="row-2">
              <Field label="مبدا" error={errors.fromStationCode}>
                <select value={state.fromStationCode} onChange={(e) => set('fromStationCode', e.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {stations.map((s) => (
                    <option key={s.Code} value={s.Code}>{s.Name}</option>
                  ))}
                </select>
              </Field>
              <Field label="مقصد" error={errors.toStationCode}>
                <select value={state.toStationCode} onChange={(e) => set('toStationCode', e.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {stations.map((s) => (
                    <option key={s.Code} value={s.Code}>{s.Name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="row-2">
              <Field label="از تاریخ" error={errors.dateFrom}>
                <DatePicker
                  value={state.dateFrom}
                  onChange={(v) => set('dateFrom', v)}
                  invalid={Boolean(errors.dateFrom)}
                />
              </Field>
              <Field
                label="تا تاریخ"
                hint="خالی بگذارید یعنی فقط همان یک روز"
                error={errors.dateTo}
              >
                <DatePicker
                  value={state.dateTo}
                  onChange={(v) => set('dateTo', v)}
                  min={state.dateFrom}
                  invalid={Boolean(errors.dateTo)}
                />
              </Field>
            </div>

            <div className="row-3">
              <Field label="بزرگسال" error={errors.adult}><input type="number" min="0" value={state.adult} onChange={(e) => set('adult', e.target.value)} className="tnum" /></Field>
              <Field label="خردسال"><input type="number" min="0" value={state.child} onChange={(e) => set('child', e.target.value)} className="tnum" /></Field>
              <Field label="نوزاد"><input type="number" min="0" value={state.infant} onChange={(e) => set('infant', e.target.value)} className="tnum" /></Field>
            </div>

            <label className="check">
              <input type="checkbox" checked={state.charterCoupe} onChange={(e) => set('charterCoupe', e.target.checked)} />
              کوپه دربست باشد
            </label>
          </Section>

          {/* ── مسافران ─────────────────────────────────────────────── */}
          <Section title="مسافران" id="passengers">
            <Field label="شماره همراه برای پیامک رجا" error={errors.contactMobile}>
              <input
                value={state.contactMobile}
                onChange={(e) => set('contactMobile', e.target.value)}
                placeholder="09xxxxxxxxx"
                className="tnum"
                inputMode="numeric"
              />
            </Field>

            <Field label="روش پر کردن فرم">
              <select value={state.passengerFillMode} onChange={(e) => set('passengerFillMode', e.target.value)}>
                <option value="profile">از پروفایل‌های همین اپ</option>
                <option value="previousPassengers">از «مسافرین سابق» رجا</option>
                <option value="auto">اول مسافرین سابق، بعد پروفایل</option>
              </select>
            </Field>

            <Field
              label="پروفایل مسافران"
              hint="به همان ترتیب در فرم رجا نشانده می‌شوند"
              error={errors.passengerIds}
            >
              <div className="chips">
                {passengers.length === 0 && <span className="field-hint">هنوز مسافری تعریف نکرده‌اید.</span>}
                {passengers.map((p) => {
                  const selected = state.passengerIds.includes(p.id!);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip${selected ? ' is-on' : ''}`}
                      onClick={() =>
                        set(
                          'passengerIds',
                          selected
                            ? state.passengerIds.filter((id) => id !== p.id)
                            : [...state.passengerIds, p.id!],
                        )
                      }
                      aria-pressed={selected}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          {/* ── فیلترهای پیشرفته ────────────────────────────────────── */}
          <Section title="فیلترهای پیشرفته" id="filters">
            <div className="row-2">
              <Field label="ساعت حرکت از" error={errors.departFrom}><input value={state.departFrom} onChange={(e) => set('departFrom', e.target.value)} placeholder="08:00" className="tnum" /></Field>
              <Field label="تا" error={errors.departTo}><input value={state.departTo} onChange={(e) => set('departTo', e.target.value)} placeholder="20:00" className="tnum" /></Field>
            </div>
            <div className="row-2">
              <Field label="ساعت رسیدن از" error={errors.arriveFrom}><input value={state.arriveFrom} onChange={(e) => set('arriveFrom', e.target.value)} placeholder="05:00" className="tnum" /></Field>
              <Field label="تا" error={errors.arriveTo}><input value={state.arriveTo} onChange={(e) => set('arriveTo', e.target.value)} placeholder="12:00" className="tnum" /></Field>
            </div>
            <div className="row-2">
              <Field label="حداقل قیمت (ریال)"><input value={state.minPriceRial} onChange={(e) => set('minPriceRial', e.target.value)} className="tnum" /></Field>
              <Field label="حداکثر قیمت (ریال)" error={errors.maxPriceRial}><input value={state.maxPriceRial} onChange={(e) => set('maxPriceRial', e.target.value)} placeholder="12000000" className="tnum" /></Field>
            </div>
            <Field label="نوع سالن" hint="با ویرگول جدا کنید، مثل: کوپه ای 4 نفره، کوپه ای 6 نفره">
              <input value={state.salonTypes} onChange={(e) => set('salonTypes', e.target.value)} />
            </Field>
            <Field label="عنوان سالن" hint="مثل: البرز، طلائیه">
              <input value={state.salonTitles} onChange={(e) => set('salonTitles', e.target.value)} />
            </Field>
            <Field label="شرکت مالک" hint="مثل: رجا، ریل ترابر سبا، جوپار">
              <input value={state.owners} onChange={(e) => set('owners', e.target.value)} />
            </Field>
            <div className="row-2">
              <Field label="فقط این شماره قطارها"><input value={state.trainNumbersInclude} onChange={(e) => set('trainNumbersInclude', e.target.value)} placeholder="533، 620" className="tnum" /></Field>
              <Field label="این شماره قطارها هرگز"><input value={state.trainNumbersExclude} onChange={(e) => set('trainNumbersExclude', e.target.value)} className="tnum" /></Field>
            </div>
            <Field label="حداقل صندلی خالی" hint="خالی یعنی برابر تعداد مسافران">
              <input value={state.minSeats} onChange={(e) => set('minSeats', e.target.value)} className="tnum" />
            </Field>
          </Section>

          {/* ── زمان‌بندی ───────────────────────────────────────────── */}
          <Section title="زمان‌بندی" id="schedule">
            <Field
              label="حالت"
              hint="رجا بلیت استردادی را ساعت ۹، ۱۲، ۱۵، ۱۷ و ۱۹ اضافه می‌کند"
            >
              <select value={state.scheduleMode} onChange={(e) => set('scheduleMode', e.target.value)}>
                <option value="smart">هوشمند — نزدیک ساعت‌های آزادسازی تندتر</option>
                <option value="fixed">فاصله‌ی ثابت</option>
              </select>
            </Field>

            {state.scheduleMode === 'fixed' ? (
              <Field label="فاصله (ثانیه)">
                <input value={state.baseIntervalSec} onChange={(e) => set('baseIntervalSec', e.target.value)} className="tnum" />
              </Field>
            ) : (
              <div className="row-2">
                <Field label="فاصله در ساعت طلایی (ثانیه)"><input value={state.burstIntervalSec} onChange={(e) => set('burstIntervalSec', e.target.value)} className="tnum" /></Field>
                <Field label="فاصله در بقیه ساعات (ثانیه)"><input value={state.idleIntervalSec} onChange={(e) => set('idleIntervalSec', e.target.value)} className="tnum" /></Field>
              </div>
            )}

            <div className="row-2">
              <Field label="رصد فقط از ساعت" error={errors.activeFrom}><input value={state.activeFrom} onChange={(e) => set('activeFrom', e.target.value)} placeholder="08:00" className="tnum" /></Field>
              <Field label="تا ساعت" error={errors.activeTo}><input value={state.activeTo} onChange={(e) => set('activeTo', e.target.value)} placeholder="23:00" className="tnum" /></Field>
            </div>

            <Field label="سقف مدت اجرا (دقیقه)" hint="صفر یعنی بی‌نهایت">
              <input value={state.maxRuntimeMin} onChange={(e) => set('maxRuntimeMin', e.target.value)} className="tnum" />
            </Field>

            <label className="check">
              <input type="checkbox" checked={state.stopOnSuccess} onChange={(e) => set('stopOnSuccess', e.target.checked)} />
              بعد از رسیدن به درگاه، رصد متوقف شود
            </label>
          </Section>

          {/* ── اولویت انتخاب ───────────────────────────────────────── */}
          <Section title="اولویت انتخاب قطار" id="ranking">
            <Field label="حالت">
              <select value={state.rankingMode} onChange={(e) => set('rankingMode', e.target.value)}>
                <option value="firstFound">هرکدام زودتر پیدا شد (سریع‌ترین)</option>
                <option value="priority">بر اساس اولویت</option>
              </select>
            </Field>

            {state.rankingMode === 'priority' && (
              <>
                <Field label="معیار">
                  <select value={state.rankingBy} onChange={(e) => set('rankingBy', e.target.value)}>
                    <option value="cheapest">ارزان‌ترین</option>
                    <option value="closestToTime">نزدیک‌ترین به ساعت دلخواه</option>
                    <option value="trainOrder">ترتیب قطارهای مورد علاقه</option>
                  </select>
                </Field>
                {state.rankingBy === 'closestToTime' && (
                  <Field label="ساعت دلخواه حرکت" error={errors.preferredTime}>
                    <input value={state.preferredTime} onChange={(e) => set('preferredTime', e.target.value)} placeholder="12:00" className="tnum" />
                  </Field>
                )}
                {state.rankingBy === 'trainOrder' && (
                  <Field label="ترتیب شماره قطارها" hint="از بیشترین اولویت به کمترین">
                    <input value={state.trainOrder} onChange={(e) => set('trainOrder', e.target.value)} placeholder="533، 620" className="tnum" />
                  </Field>
                )}
              </>
            )}
          </Section>
        </div>

        <footer className="drawer-foot">
          <Button onClick={onClose}>انصراف</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </footer>
      </aside>
    </div>
  );
}

/** بخش جمع‌شونده — پایه‌ی افشای تدریجی فرم. */
function Section({
  title,
  id,
  open = false,
  children,
}: {
  title: string;
  id: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="section" data-section={id} open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
