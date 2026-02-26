const vietnamOffsetMs = 7 * 60 * 60 * 1000;

export function shareDateFormat(locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
}

export function expiryToVietnamInput(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + vietnamOffsetMs).toISOString().slice(0, 16) : '';
}

export function expiryFromVietnamInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}:00+07:00`);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  const result = new Date(timestamp).toISOString();
  return expiryToVietnamInput(result) === value ? result : null;
}
