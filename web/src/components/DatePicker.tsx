/**
 * انتخابگر تاریخ شمسی.
 *
 * تایپ دستی تاریخ منبع اصلی خطا بود (قالب اشتباه، ماه ۱۳، روز ۳۱ در ماهی
 * که ۳۰ روز دارد). اینجا هم می‌شود تایپ کرد هم از تقویم انتخاب کرد، و
 * روزهای نامعتبر اصلاً قابل کلیک نیستند.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDays,
  compareJalali,
  daysInMonth,
  formatJalali,
  parseJalali,
  todayJalali,
  weekdayIndex,
  type JalaliParts,
} from '../lib/jalali';
import { fa } from '../lib/format';
import './DatePicker.css';

interface Props {
  /** تاریخ به شکل `YYYY/MM/DD`؛ رشته‌ی خالی یعنی انتخاب‌نشده */
  value: string;
  onChange: (value: string) => void;
  /** تاریخ‌های پیش از این قابل انتخاب نیستند */
  min?: string;
  placeholder?: string;
  /** پیام خطا، برای حالتی که فرم اعتبارسنجی کرده */
  invalid?: boolean;
}

export function DatePicker({ value, onChange, min, placeholder, invalid }: Props) {
  const [open, setOpen] = useState(false);
  /** مختصات ثابت تقویم روی صفحه — با `position: fixed` محاسبه می‌شود */
  const [popStyle, setPopStyle] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [text, setText] = useState(value);
  const selected = useMemo(() => parseJalali(value), [value]);
  const [cursor, setCursor] = useState<JalaliParts>(() => selected ?? todayJalali());
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // وقتی مقدار از بیرون عوض شد (مثلاً ویرایش رصد) ورودی متنی را همگام کن
  useEffect(() => setText(value), [value]);

  /**
   * جای‌گذاری تقویم روی صفحه.
   *
   * تقویم با پورتال به `document.body` می‌رود و `position: fixed` می‌گیرد.
   *
   * دو دلیل: کشوی فرم اسکرول دارد و تقویم را می‌بُرید؛ و مهم‌تر اینکه کشو
   * انیمیشن `transform` دارد و هر عنصر ترنسفورم‌دار برای فرزندان `fixed`
   * خودش «قاب مرجع» می‌سازد — یعنی مختصات به‌جای viewport نسبت به کشو
   * حساب می‌شد و تقویم از لبه‌ی صفحه بیرون می‌زد.
   */
  useEffect(() => {
    if (!open || !root.current) return;

    const place = (): void => {
      if (!root.current) return;
      const box = root.current.getBoundingClientRect();
      // اندازه‌ی واقعیِ رندرشده؛ روی موبایل عرض با max-width کوچک‌تر می‌شود
      const popBox = pop.current?.getBoundingClientRect();
      const height = popBox?.height || 320;
      const width = popBox?.width || 268;
      const GAP = 6;
      const MARGIN = 8;

      // اگر پایین جا نیست و بالا هست، بالای فیلد باز شود
      const below = box.bottom + GAP;
      const above = box.top - GAP - height;
      const top =
        below + height <= window.innerHeight - MARGIN || above < MARGIN ? below : above;

      setPopStyle({
        top: Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - height - MARGIN)),
        left: Math.min(Math.max(MARGIN, box.left), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
      });
    };

    place();
    // یک بار دیگر پس از رندر، وقتی ابعاد واقعی تقویم مشخص شده است
    const frame = requestAnimationFrame(place);

    // با اسکرول کشو یا تغییر اندازه‌ی پنجره، تقویم همراه فیلد بماند
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // با کلیک بیرون یا Escape بسته شود
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent): void => {
      const target = event.target as Node;
      // تقویم با پورتال بیرون از root است، پس باید جداگانه بررسی شود
      if (root.current?.contains(target) || pop.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const minParts = min ? parseJalali(min) : null;

  /** روزهای ماه جاری به همراه جای خالی ابتدای هفته */
  const cells = useMemo(() => {
    const total = daysInMonth(cursor.year, cursor.month);
    const lead = weekdayIndex({ year: cursor.year, month: cursor.month, day: 1 });
    const list: (JalaliParts | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= total; day += 1) {
      list.push({ year: cursor.year, month: cursor.month, day });
    }
    return list;
  }, [cursor.year, cursor.month]);

  const today = todayJalali();

  function commitText(raw: string): void {
    const parsed = parseJalali(raw);
    if (parsed) {
      onChange(formatJalali(parsed));
      setCursor(parsed);
    } else if (raw.trim() === '') {
      onChange('');
    }
    // ورودی نامعتبر را پاک نمی‌کنیم؛ فرم خودش خطا را نشان می‌دهد
  }

  function pick(day: JalaliParts): void {
    onChange(formatJalali(day));
    setOpen(false);
  }

  const shiftMonth = (delta: number): void =>
    setCursor((current) => {
      const month = current.month + delta;
      if (month < 1) return { year: current.year - 1, month: 12, day: 1 };
      if (month > 12) return { year: current.year + 1, month: 1, day: 1 };
      return { ...current, month, day: 1 };
    });

  return (
    <div className="datepicker" ref={root}>
      <div className={`datepicker-input${invalid ? ' is-invalid' : ''}`}>
        <input
          value={fa(text)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            // به محض کامل شدن تاریخ، ثبتش کن؛ منتظر blur نمان
            const parsed = parseJalali(next);
            if (parsed) {
              onChange(formatJalali(parsed));
              setCursor(parsed);
            }
          }}
          onBlur={(event) => commitText(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? '۱۴۰۵/۰۶/۲۸'}
          className="tnum"
          inputMode="numeric"
        />
        <button
          type="button"
          className="datepicker-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label="باز کردن تقویم"
          aria-expanded={open}
        >
          <CalendarDays size={16} aria-hidden="true" />
        </button>
      </div>

      {open &&
        createPortal(
          <div
            className="datepicker-pop"
            ref={pop}
            style={{ top: popStyle.top, left: popStyle.left }}
            role="dialog"
            aria-label="انتخاب تاریخ"
          >
          <header className="datepicker-head">
            {/* در RTL، «قبل» سمت راست است */}
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="ماه قبل">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <span className="datepicker-title tnum">
              {MONTH_NAMES[cursor.month - 1]} {fa(cursor.year)}
            </span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="ماه بعد">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          </header>

          <div className="datepicker-grid" role="grid">
            {WEEKDAY_SHORT.map((name, index) => (
              <span key={index} className="datepicker-weekday" aria-hidden="true">
                {name}
              </span>
            ))}

            {cells.map((day, index) =>
              day === null ? (
                <span key={`gap-${index}`} />
              ) : (
                (() => {
                  const disabled = minParts !== null && compareJalali(day, minParts) < 0;
                  const isSelected = selected !== null && compareJalali(day, selected) === 0;
                  const isToday = compareJalali(day, today) === 0;
                  return (
                    <button
                      key={formatJalali(day)}
                      type="button"
                      className={[
                        'datepicker-day',
                        isSelected ? 'is-selected' : '',
                        isToday ? 'is-today' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={disabled}
                      onClick={() => pick(day)}
                      aria-pressed={isSelected}
                      aria-label={formatJalali(day)}
                    >
                      {fa(day.day)}
                    </button>
                  );
                })()
              ),
            )}
          </div>

            <footer className="datepicker-foot">
              <button type="button" onClick={() => pick(today)}>
                امروز
              </button>
              <button type="button" onClick={() => pick(addDays(today, 1))}>
                فردا
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                پاک کردن
              </button>
            </footer>
          </div>,
          document.body,
        )}
    </div>
  );
}
