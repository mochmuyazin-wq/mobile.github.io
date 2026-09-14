import dayjs from "dayjs";
import "dayjs/locale/id";

dayjs.locale("id");

export { dayjs };

export function formatIDR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  return `${sign}Rp${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function parseAmount(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export function formatAmountInput(amount: number): string {
  if (!amount) return "";
  return formatIDR(amount).replace("Rp", "").trim();
}

export function todayISO(): string {
  return dayjs().format("YYYY-MM-DD");
}

export function monthKey(d?: string): string {
  return dayjs(d ?? undefined).format("YYYY-MM");
}

export function monthLabelID(month: string): string {
  return dayjs(`${month}-01`).format("MMM YYYY");
}

export function monthShort(month: string): string {
  return dayjs(`${month}-01`).format("MMM");
}

export function dayLabelID(iso: string): string {
  const d = dayjs(iso);
  if (d.isSame(dayjs(), "day")) return "Hari Ini";
  if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Kemarin";
  return d.format("dddd, DD MMM");
}

export function dateLabelID(iso: string): string {
  return dayjs(iso).format("DD MMM YYYY");
}

export function timeLabel(iso: string): string {
  return dayjs(iso).format("HH:mm");
}

export function relativeTimeID(iso: string): string {
  const then = dayjs(iso);
  const diffMin = dayjs().diff(then, "minute");
  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffH = dayjs().diff(then, "hour");
  if (diffH < 24) return `${diffH} jam lalu`;
  const diffD = dayjs().diff(then, "day");
  if (diffD < 7) return `${diffD} hari lalu`;
  return then.format("DD MMM");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function greetingID(): string {
  const h = dayjs().hour();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export function lastMonths(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      dayjs()
        .subtract(i, "month")
        .format("YYYY-MM"),
    );
  }
  return out;
}
