/**
 * Helper to convert numbers to Arabic words (Tafqeet / تفقيط)
 * Handles currencies and amounts with full grammatical accuracy.
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const ELEVENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function convertGroup(n: number): string {
  let res = '';
  const h = Math.floor(n / 100);
  const rem = n % 100;

  if (h > 0) {
    res += HUNDREDS[h];
  }

  if (rem > 0) {
    if (res.length > 0) res += ' و';
    if (rem <= 10) {
      res += ONES[rem];
    } else if (rem < 20) {
      res += ELEVENS[rem - 10];
    } else {
      const o = rem % 10;
      const t = Math.floor(rem / 10);
      if (o > 0) {
        res += `${ONES[o]} و${TENS[t]}`;
      } else {
        res += TENS[t];
      }
    }
  }

  return res;
}

export function tafqeetNumber(val: number): string {
  if (val === 0) return 'صفر';
  if (val < 0) return 'سالب ' + tafqeetNumber(Math.abs(val));

  let intPart = Math.floor(val);
  const decPart = Math.round((val - intPart) * 100);

  let parts: string[] = [];

  // Billions
  const billions = Math.floor(intPart / 1000000000);
  intPart %= 1000000000;
  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(`${convertGroup(billions)} مليارات`);
    else parts.push(`${convertGroup(billions)} مليار`);
  }

  // Millions
  const millions = Math.floor(intPart / 1000000);
  intPart %= 1000000;
  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(`${convertGroup(millions)} ملايين`);
    else parts.push(`${convertGroup(millions)} مليون`);
  }

  // Thousands
  const thousands = Math.floor(intPart / 1000);
  intPart %= 1000;
  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertGroup(thousands)} آلاف`);
    else parts.push(`${convertGroup(thousands)} ألف`);
  }

  // Remaining hundreds, tens, ones
  if (intPart > 0) {
    parts.push(convertGroup(intPart));
  }

  let text = parts.join(' و');

  if (decPart > 0) {
    text += ` وقرش ${convertGroup(decPart)}`;
  }

  return text;
}

export function tafqeetCurrency(val: number, currencyName: string = 'جنيه مصري'): string {
  if (val <= 0) return `صفر ${currencyName}`;
  const words = tafqeetNumber(val);
  return `فقط وقدره ${words} ${currencyName} لا غير`;
}
