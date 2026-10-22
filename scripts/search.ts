/**
 * تست دستی جستجو و پارس نتایج.
 *
 *   npm run dev:search -- --from بندرعباس --to اصفهان --date 1405/06/28
 *
 * نیازی به ورود ندارد؛ صفحه‌ی نتایج رجا برای مهمان هم باز است.
 */
import { closeBrowser, getProbePage } from '../src/raja/browser.js';
import { probeDates } from '../src/raja/searchProbe.js';
import { codeByName } from '../src/raja/stations.js';
import { normalizeJalali, todayJalali } from '../src/utils/jalali.js';
import { toPersianDigits } from '../src/utils/persianDigits.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const fromName = arg('from', 'بندرعباس');
const toName = arg('to', 'اصفهان');
const date = normalizeJalali(arg('date', todayJalali()));

const fromCode = await codeByName(fromName);
const toCode = await codeByName(toName);

if (fromCode === null || toCode === null) {
  console.error(`ایستگاه پیدا نشد: ${fromCode === null ? fromName : toName}`);
  process.exit(1);
}

console.log(`جستجو: ${fromName} (${fromCode}) → ${toName} (${toCode})  تاریخ ${date}\n`);

const page = await getProbePage();
const report = await probeDates(
  page,
  {
    fromStationCode: fromCode,
    toStationCode: toCode,
    adult: 1,
    child: 0,
    infant: 0,
    ticketType: 'Family',
    charterCoupe: false,
    description: `قطار ${fromName} به ${toName}`,
  },
  [date],
);
const offers = report.offers;

if (report.serviceErrors > 0) {
  console.log('رجا خطای اتصال سرویس داد — کمی بعد دوباره تلاش کنید.');
}

if (offers.length === 0) {
  console.log('هیچ قطاری پیدا نشد.');
} else {
  for (const o of offers) {
    const price = o.priceRial ? toPersianDigits(o.priceRial.toLocaleString('en-US')) : '—';
    console.log(
      [
        `قطار ${o.trainNumber ?? '—'}`,
        o.owner,
        o.salonTitle,
        o.salonType,
        `${o.departTime ?? '—'} → ${o.arriveTime ?? '—'}`,
        `${price} ریال`,
        `${o.availableSeats ?? 0} بلیت`,
        o.status,
      ].join('  |  '),
    );
  }
  console.log(`\nمجموع ${offers.length} قطار.`);
}

await closeBrowser();
