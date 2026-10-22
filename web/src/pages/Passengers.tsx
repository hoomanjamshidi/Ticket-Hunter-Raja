/**
 * پروفایل مسافران.
 *
 * این اطلاعات همان چیزی است که ربات در فرم رجا می‌نشاند، پس اعتبارسنجی
 * اینجا مهم است — یک کد ملی اشتباه یعنی از دست دادن بلیت در آخرین لحظه.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, type Passenger } from '../lib/api';
import { fa } from '../lib/format';
import { Button, Card, Empty, Field } from '../components/ui';
import { DatePicker } from '../components/DatePicker';
import { parseJalali } from '../lib/jalali';

const EMPTY: Passenger = {
  firstName: '',
  lastName: '',
  nationalId: '',
  birthDate: '',
  ageType: 'بزرگسال',
  meal: 'بدون غذا',
  discountCode: '',
};

/** ارقام فارسی را برای ذخیره به لاتین برمی‌گرداند. */
function toLatin(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/** اعتبارسنجی — پیام‌ها فارسی و مشخص‌اند، نه «ورودی نامعتبر». */
function validate(passenger: Passenger): Partial<Record<keyof Passenger, string>> {
  const errors: Partial<Record<keyof Passenger, string>> = {};
  if (!passenger.firstName.trim()) errors.firstName = 'نام را وارد کنید.';
  if (!passenger.lastName.trim()) errors.lastName = 'نام خانوادگی را وارد کنید.';

  const id = toLatin(passenger.nationalId).trim();
  if (!id) errors.nationalId = 'کد ملی یا شماره پاسپورت را وارد کنید.';
  else if (passenger.ageType !== 'تبعه خارجی' && !/^\d{10}$/.test(id))
    errors.nationalId = 'کد ملی باید دقیقاً ۱۰ رقم باشد.';

  if (!parseJalali(passenger.birthDate))
    errors.birthDate = 'تاریخ تولد را از تقویم انتخاب کنید.';

  return errors;
}

export function PassengersPage() {
  const [list, setList] = useState<Passenger[]>([]);
  const [draft, setDraft] = useState<Passenger | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Passenger, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const load = (): void => {
    void api.passengers().then(setList).catch(() => undefined);
  };
  useEffect(load, []);

  const set = <K extends keyof Passenger>(key: K, value: Passenger[K]): void =>
    setDraft((previous) => (previous ? { ...previous, [key]: value } : previous));

  async function save(): Promise<void> {
    if (!draft) return;
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload: Passenger = {
      ...draft,
      nationalId: toLatin(draft.nationalId).trim(),
      birthDate: toLatin(draft.birthDate).trim(),
    };

    try {
      if (draft.id) await api.updatePassenger(draft.id, payload);
      else await api.createPassenger(payload);
      setDraft(null);
      setServerError(null);
      load();
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove(passenger: Passenger): Promise<void> {
    if (!confirm(`${passenger.firstName} ${passenger.lastName} حذف شود؟`)) return;
    await api.deletePassenger(passenger.id!);
    load();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>مسافران</h1>
        <Button variant="primary" onClick={() => { setDraft({ ...EMPTY }); setErrors({}); }}>
          <Plus size={16} aria-hidden="true" />
          مسافر جدید
        </Button>
      </div>

      {serverError && <p className="page-error" role="alert">{serverError}</p>}

      {draft && (
        <Card title={draft.id ? 'ویرایش مسافر' : 'مسافر جدید'}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Field label="نام" error={errors.firstName}>
              <input value={draft.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </Field>
            <Field label="نام خانوادگی" error={errors.lastName}>
              <input value={draft.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </Field>
            <Field label="نوع سنی">
              <select value={draft.ageType} onChange={(e) => set('ageType', e.target.value as Passenger['ageType'])}>
                <option>بزرگسال</option>
                <option>خردسال</option>
                <option>تبعه خارجی</option>
              </select>
            </Field>
            <Field label="کد ملی / شماره پاسپورت" error={errors.nationalId}>
              <input value={draft.nationalId} onChange={(e) => set('nationalId', e.target.value)} className="tnum" />
            </Field>
            <Field label="تاریخ تولد" error={errors.birthDate}>
              <DatePicker
                value={draft.birthDate}
                onChange={(v) => set('birthDate', v)}
                placeholder="۱۳۵۷/۱۱/۱۲"
                invalid={Boolean(errors.birthDate)}
              />
            </Field>
            <Field label="غذا" hint="متن باید بخشی از گزینه‌ی سایت رجا باشد">
              <input value={draft.meal} onChange={(e) => set('meal', e.target.value)} />
            </Field>
            <Field label="کد تخفیف">
              <input value={draft.discountCode} onChange={(e) => set('discountCode', e.target.value)} />
            </Field>
          </div>
          <div className="card-actions" style={{ marginTop: 'var(--s-4)', justifyContent: 'flex-end' }}>
            <Button onClick={() => setDraft(null)}>انصراف</Button>
            <Button variant="primary" onClick={() => void save()}>ذخیره</Button>
          </div>
        </Card>
      )}

      <Card title="فهرست مسافران">
        {list.length === 0 ? (
          <Empty title="هنوز مسافری تعریف نکرده‌اید" hint="ربات از این اطلاعات برای پر کردن فرم رجا استفاده می‌کند." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>نام</th>
                  <th>کد ملی</th>
                  <th>تاریخ تولد</th>
                  <th>نوع سنی</th>
                  <th>غذا</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button className="link" onClick={() => { setDraft(p); setErrors({}); }}>
                        {p.firstName} {p.lastName}
                      </button>
                    </td>
                    <td className="tnum">{fa(p.nationalId)}</td>
                    <td className="tnum">{fa(p.birthDate)}</td>
                    <td>{p.ageType}</td>
                    <td>{p.meal}</td>
                    <td>
                      <Button variant="danger" onClick={() => void remove(p)} title="حذف">
                        <Trash2 size={15} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
