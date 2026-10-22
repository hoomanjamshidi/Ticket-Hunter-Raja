/**
 * نتایج زنده: جدول بلیت‌های دیده‌شده در آخرین چرخه‌ها، و لاگ زنده‌ی ربات.
 */
import { useEffect, useState } from 'react';
import { api, type OfferRow, type Watch } from '../lib/api';
import { fa, money, timeOf } from '../lib/format';
import { Card, Empty } from '../components/ui';
import type { LogEvent } from '../lib/useLiveLog';
import './Live.css';

const STATUS_LABEL: Record<string, string> = {
  available: 'قابل خرید',
  soldOut: 'تمام شد',
  selected: 'انتخاب‌شده',
  departed: 'حرکت کرده',
  unknown: 'نامشخص',
};

export function LivePage({ watches, events }: { watches: Watch[]; events: LogEvent[] }) {
  const [watchId, setWatchId] = useState<number | null>(watches[0]?.id ?? null);
  const [offers, setOffers] = useState<OfferRow[]>([]);

  // اگر هنوز رصدی انتخاب نشده، اولی را بردار
  useEffect(() => {
    if (watchId === null && watches.length > 0) setWatchId(watches[0]!.id);
  }, [watches, watchId]);

  useEffect(() => {
    if (watchId === null) return;
    const load = (): void => {
      void api.offers(watchId).then(setOffers).catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [watchId]);

  const selected = watches.find((w) => w.id === watchId);

  return (
    <div className="page">
      <div className="page-head">
        <h1>نتایج زنده</h1>
        {watches.length > 0 && (
          <select
            className="picker"
            value={watchId ?? ''}
            onChange={(e) => setWatchId(Number(e.target.value))}
            aria-label="انتخاب رصد"
          >
            {watches.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      <Card title="بلیت‌های دیده‌شده">
        {offers.length === 0 ? (
          <Empty
            title="هنوز بلیتی ثبت نشده"
            hint={
              selected?.running
                ? 'رصد فعال است؛ نتایج اولین چرخه به‌زودی اینجا می‌آید.'
                : 'رصد را شروع کنید تا نتایج اینجا نشان داده شوند.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>قطار</th>
                  <th>مالک</th>
                  <th>نوع سالن</th>
                  <th>حرکت</th>
                  <th>ورود</th>
                  <th>قیمت (ریال)</th>
                  <th>ظرفیت</th>
                  <th>وضعیت</th>
                  <th>دیده شد</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} className={offer.isMatch ? 'is-match' : undefined}>
                    <td className="tnum">{fa(offer.date)}</td>
                    <td className="tnum">
                      {offer.trainNumber ? fa(offer.trainNumber) : '—'}
                      {offer.isMatch === 1 && <span className="match-tag">مطابق فیلتر</span>}
                    </td>
                    <td>{offer.owner || '—'}</td>
                    <td>{offer.salonType || '—'}</td>
                    <td className="tnum">{offer.departTime ? fa(offer.departTime) : '—'}</td>
                    <td className="tnum">{offer.arriveTime ? fa(offer.arriveTime) : '—'}</td>
                    <td className="tnum">{money(offer.priceRial)}</td>
                    <td className="tnum">{offer.seats === null ? '—' : fa(offer.seats)}</td>
                    <td>{STATUS_LABEL[offer.status] ?? offer.status}</td>
                    <td className="tnum">{timeOf(offer.seenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="لاگ زنده">
        {events.length === 0 ? (
          <Empty title="هنوز رویدادی نیست" hint="به محض شروع رصد، اتفاقات اینجا نشان داده می‌شوند." />
        ) : (
          <ul className="log">
            {events.map((event, index) => (
              <li key={`${event.at}-${index}`} className={`log-item log-${event.level}`}>
                <span className="log-time tnum">{timeOf(event.at)}</span>
                <span className="log-scope">{event.scope}</span>
                <span className="log-msg">{event.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
