/** تنظیمات رجا، پیامک و مرورگر؛ همه در دیتابیس محلی پنل ذخیره می‌شوند. */
import { useEffect, useState, type FormEvent } from 'react';
import { Globe, PlugZap, Save, Send } from 'lucide-react';
import { api, type Settings, type SettingsUpdate } from '../lib/api';
import { Banner, Button, Card, Field, StatusDot } from '../components/ui';

type Action = 'raja' | 'rajaTest' | 'sms' | 'smsTest' | 'proxy' | 'proxyTest';

/**
 * نتیجه به همراه بخشی که آن را تولید کرده.
 *
 * بدون نگه‌داشتن `action`، پیام همیشه بالای صفحه می‌نشست و کاربری که روی
 * دکمه‌ی تست در انتهای صفحه کلیک کرده بود، اصلاً نتیجه را نمی‌دید.
 */
type Result = { action: Action; ok: boolean; message: string; hint?: string };

export function SettingsPage({
  settings,
  onChange,
}: {
  settings: Settings | null;
  onChange: () => void | Promise<void>;
}) {
  const [initialized, setInitialized] = useState(false);
  const [rajaUsername, setRajaUsername] = useState('');
  const [rajaPassword, setRajaPassword] = useState('');
  const [smsMode, setSmsMode] = useState<'simple' | 'pattern'>('simple');
  const [smsUsername, setSmsUsername] = useState('');
  const [smsPassword, setSmsPassword] = useState('');
  const [smsFrom, setSmsFrom] = useState('');
  const [smsBodyId, setSmsBodyId] = useState('');
  const [notifyMobile, setNotifyMobile] = useState('');
  const [proxyServer, setProxyServer] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [activeAction, setActiveAction] = useState<Action | null>(null);

  // تازه‌سازی پنج‌ثانیه‌ای وضعیت نباید ورودی‌های ذخیره‌نشده‌ی کاربر را پاک کند.
  useEffect(() => {
    if (!settings || initialized) return;
    setSmsMode(settings.sms.mode);
    setSmsFrom(settings.sms.from);
    setSmsBodyId(settings.sms.bodyId);
    setNotifyMobile(settings.sms.notifyMobile);
    setProxyServer(settings.proxy.server);
    setProxyUsername(settings.proxy.username);
    setInitialized(true);
  }, [initialized, settings]);

  async function runAction(
    action: Action,
    task: () => Promise<Omit<Result, 'action'>>,
  ): Promise<void> {
    setActiveAction(action);
    setResult(null);
    try {
      setResult({ action, ...(await task()) });
      await onChange();
    } catch (cause) {
      setResult({
        action,
        ok: false,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setActiveAction(null);
    }
  }

  /** نتیجه را فقط زیر همان بخشی نشان می‌دهد که کاربر رویش کلیک کرده. */
  function resultFor(...actions: Action[]) {
    if (!result || !actions.includes(result.action)) return null;
    return (
      <div style={{ marginTop: 'var(--s-4)' }}>
        <Banner tone={result.ok ? 'success' : 'danger'}>{result.message}</Banner>
        {result.hint && (
          <div style={{ marginTop: 'var(--s-2)' }}>
            <Banner tone="warning">{result.hint}</Banner>
          </div>
        )}
      </div>
    );
  }

  function saveRaja(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAction('raja', async () => {
      const raja: NonNullable<SettingsUpdate['raja']> = {};
      if (rajaUsername.trim()) raja.username = rajaUsername.trim();
      if (rajaPassword) raja.password = rajaPassword;
      await api.updateSettings({ raja });
      setRajaUsername('');
      setRajaPassword('');
      return { ok: true, message: 'تنظیمات حساب رجا ذخیره شد.' };
    });
  }

  /** واقعاً وارد سایت رجا می‌شود تا معلوم شود نام کاربری و رمز درست‌اند. */
  function testRaja(): void {
    void runAction('rajaTest', () => api.testRaja());
  }

  function saveSms(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAction('sms', async () => {
      const sms: NonNullable<SettingsUpdate['sms']> = {
        mode: smsMode,
        from: smsFrom.trim(),
        bodyId: smsBodyId.trim(),
        notifyMobile: notifyMobile.trim(),
      };
      if (smsUsername.trim()) sms.username = smsUsername.trim();
      if (smsPassword) sms.password = smsPassword;
      await api.updateSettings({ sms });
      setSmsUsername('');
      setSmsPassword('');
      return { ok: true, message: 'تنظیمات ملی پیامک ذخیره شد.' };
    });
  }

  function saveProxy(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runAction('proxy', async () => {
      const proxy: NonNullable<SettingsUpdate['proxy']> = {
        server: proxyServer.trim(),
        username: proxyUsername.trim(),
      };
      if (proxyPassword) proxy.password = proxyPassword;
      await api.updateSettings({ proxy });
      setProxyPassword('');
      return {
        ok: true,
        message: proxyServer.trim()
          ? 'پروکسی ذخیره شد و مرورگر با تنظیمات تازه دوباره باز می‌شود.'
          : 'پروکسی حذف شد؛ اتصال مستقیم خواهد بود.',
      };
    });
  }

  /** IP خروجی را نشان می‌دهد و بررسی می‌کند رجا از این مسیر باز می‌شود یا نه. */
  function testProxy(): void {
    void runAction('proxyTest', async () => {
      const response = await api.testProxy();
      return {
        ok: response.ok,
        message: response.message,
        hint:
          !response.rajaReachable && !response.usingProxy
            ? 'سایت رجا فقط از داخل ایران باز می‌شود. اگر سرور جای دیگری است، یک پروکسی ایران تنظیم کنید.'
            : undefined,
      };
    });
  }

  function testSms(): void {
    void runAction('smsTest', async () => {
      const response = await api.testSms({
        to: testTo.trim() || undefined,
        mode: smsMode,
      });
      return {
        ok: response.ok,
        message: response.message,
        hint: response.shouldSwitchToPattern
          ? 'این شماره در لیست سیاه مخابرات است. حالت پیامک را روی «الگو» بگذارید و ذخیره کنید.'
          : undefined,
      };
    });
  }

  if (!settings) return <div className="page">در حال بارگذاری…</div>;

  const busy = activeAction !== null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>تنظیمات</h1>
      </div>

      <Banner tone="info">
        تنظیمات در دیتابیس محلی همین برنامه ذخیره می‌شوند. رمزها و API Key بعد از ذخیره
        دوباره نمایش داده نمی‌شوند؛ خالی گذاشتن فیلد رمز یعنی حفظ مقدار فعلی.
      </Banner>

      <Card title="حساب رجا">
        <StatusDot
          color={settings.raja.configured ? 'var(--accent)' : 'var(--danger)'}
          label={settings.raja.configured ? `تنظیم شده (${settings.raja.username})` : 'تنظیم نشده'}
        />

        <form onSubmit={saveRaja} style={{ marginTop: 'var(--s-4)' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field
              label="نام کاربری رجا"
              hint={settings.raja.username ? `مقدار فعلی: ${settings.raja.username}` : 'شماره همراه حساب رجا'}
            >
              <input
                value={rajaUsername}
                onChange={(event) => setRajaUsername(event.target.value)}
                placeholder="09xxxxxxxxx"
                autoComplete="username"
                className="tnum"
              />
            </Field>
            <Field
              label="رمز عبور رجا"
              hint={settings.raja.hasPassword ? 'رمز ثبت شده؛ برای حفظ آن خالی بگذارید' : 'هنوز رمزی ثبت نشده'}
            >
              <input
                type="password"
                value={rajaPassword}
                onChange={(event) => setRajaPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Button variant="primary" type="submit" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              {activeAction === 'raja' ? 'در حال ذخیره…' : 'ذخیره تنظیمات رجا'}
            </Button>
            <Button onClick={testRaja} disabled={busy || !settings.raja.configured}>
              <PlugZap size={15} aria-hidden="true" />
              {activeAction === 'rajaTest' ? 'در حال ورود…' : 'تست ورود به رجا'}
            </Button>
          </div>
        </form>

        {resultFor('raja', 'rajaTest')}
      </Card>

      <Card title="پیامک (ملی پیامک)">
        <StatusDot
          color={settings.sms.configured ? 'var(--accent)' : 'var(--warning)'}
          label={settings.sms.configured ? 'آماده‌ی ارسال' : 'تنظیم ناقص'}
        />

        <form onSubmit={saveSms} style={{ marginTop: 'var(--s-4)' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label="حالت ارسال">
              <select value={smsMode} onChange={(event) => setSmsMode(event.target.value as typeof smsMode)}>
                <option value="simple">خط اختصاصی (متن آزاد)</option>
                <option value="pattern">خط خدماتی اشتراکی (الگو)</option>
              </select>
            </Field>
            <Field
              label="نام کاربری ملی پیامک"
              hint={settings.sms.username ? `مقدار فعلی: ${settings.sms.username}` : 'هنوز ثبت نشده'}
            >
              <input
                value={smsUsername}
                onChange={(event) => setSmsUsername(event.target.value)}
                autoComplete="username"
                className="tnum"
              />
            </Field>
            <Field
              label="رمز عبور یا API Key"
              hint={settings.sms.hasPassword ? 'مقدار ثبت شده؛ برای حفظ آن خالی بگذارید' : 'هنوز ثبت نشده'}
            >
              <input
                type="password"
                value={smsPassword}
                onChange={(event) => setSmsPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {smsMode === 'simple' ? (
              <Field label="شماره فرستنده" hint="خط اختصاصی پنل پیامک">
                <input value={smsFrom} onChange={(event) => setSmsFrom(event.target.value)} className="tnum" />
              </Field>
            ) : (
              <Field label="کد الگو (Body ID)" hint="شناسه‌ی متن خدماتی تأییدشده">
                <input value={smsBodyId} onChange={(event) => setSmsBodyId(event.target.value)} className="tnum" />
              </Field>
            )}
            <Field label="گیرنده‌ی پیش‌فرض" hint="شماره‌ای که اعلان‌های رصد را می‌گیرد">
              <input
                value={notifyMobile}
                onChange={(event) => setNotifyMobile(event.target.value)}
                placeholder="09xxxxxxxxx"
                className="tnum"
              />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Button variant="primary" type="submit" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              {activeAction === 'sms' ? 'در حال ذخیره…' : 'ذخیره تنظیمات پیامک'}
            </Button>
          </div>
        </form>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 'var(--s-5) 0 var(--s-4)' }} />

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
          <Field label="ارسال تست به" hint="خالی یعنی گیرنده‌ی پیش‌فرض ذخیره‌شده">
            <input
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
              placeholder="09xxxxxxxxx"
              className="tnum"
            />
          </Field>
          <div>
            <Button variant="ghost" onClick={testSms} disabled={busy}>
              <Send size={15} aria-hidden="true" />
              {activeAction === 'smsTest' ? 'در حال ارسال…' : 'ارسال پیامک تست'}
            </Button>
          </div>
        </div>

        {resultFor('sms', 'smsTest')}
      </Card>

      <Card title="مرورگر خودکار">
        <StatusDot color="var(--accent)" label="داخل همین برنامه اجرا می‌شود" />
        <p className="field-hint" style={{ margin: 'var(--s-2) 0 0' }}>
          مرورگر به صورت پنهان (headless) بالا می‌آید و هیچ پنجره‌ای روی سیستم شما
          باز نمی‌کند. تصویر زنده‌اش را در بخش «مرورگر» می‌بینید و می‌توانید همان‌جا
          کلیک و تایپ کنید — از جمله برای تکمیل پرداخت در درگاه بانک.
        </p>
      </Card>

      <Card title="پروکسی مرورگر">
        <StatusDot
          color={settings.proxy.enabled ? 'var(--accent)' : 'var(--fg-muted)'}
          label={settings.proxy.enabled ? `فعال (${settings.proxy.server})` : 'بدون پروکسی — اتصال مستقیم'}
        />

        <p className="field-hint" style={{ margin: 'var(--s-2) 0 0' }}>
          سایت رجا فقط از داخل ایران بالا می‌آید. اگر این برنامه جای دیگری اجرا می‌شود،
          ترافیک مرورگر خودکار را از یک پروکسی ایران عبور دهید.
        </p>

        <form onSubmit={saveProxy} style={{ marginTop: 'var(--s-4)' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label="آدرس پروکسی" hint="مثل http://127.0.0.1:8080 یا socks5://host:1080">
              <input
                value={proxyServer}
                onChange={(event) => setProxyServer(event.target.value)}
                placeholder="http://host:port"
                dir="ltr"
              />
            </Field>
            <Field label="نام کاربری" hint="اگر پروکسی احراز هویت ندارد خالی بگذارید">
              <input
                value={proxyUsername}
                onChange={(event) => setProxyUsername(event.target.value)}
                dir="ltr"
              />
            </Field>
            <Field
              label="رمز عبور"
              hint={settings.proxy.hasPassword ? 'رمز ثبت شده؛ برای حفظ آن خالی بگذارید' : 'اختیاری'}
            >
              <input
                type="password"
                value={proxyPassword}
                onChange={(event) => setProxyPassword(event.target.value)}
                dir="ltr"
              />
            </Field>
          </div>

          <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
            <Button variant="primary" type="submit" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              {activeAction === 'proxy' ? 'در حال ذخیره…' : 'ذخیره پروکسی'}
            </Button>
            <Button onClick={testProxy} disabled={busy}>
              <Globe size={15} aria-hidden="true" />
              {activeAction === 'proxyTest' ? 'در حال بررسی…' : 'تست اتصال و نمایش IP'}
            </Button>
          </div>
        </form>

        {resultFor('proxy', 'proxyTest')}
      </Card>

      <Card title="کپچا">
        <p style={{ margin: 0 }}>
          اگر رجا کپچا نشان دهد، ربات آن را حل نمی‌کند: متوقف می‌شود، پنجره‌ی
          مرورگر را جلو می‌آورد و برایتان پیامک می‌فرستد. به محض اینکه خودتان
          کپچا را وارد کنید، ادامه‌ی مراحل خودکار انجام می‌شود.
        </p>
      </Card>
    </div>
  );
}
