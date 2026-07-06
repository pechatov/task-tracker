import { combineDateAndTime, formatDateInput } from "../date";

export type RecurringTaskFrequency = "daily" | "weekly" | "monthly";

export type RecurringSchedule = {
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  endDate: string | null;
  frequency: RecurringTaskFrequency;
  interval: number;
  startDate: string;
};

const dayMs = 24 * 60 * 60 * 1000;

function parseDateValue(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

function dateDayNumber(dateValue: string) {
  const date = parseDateValue(dateValue);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs;
}

function getWeekStartDayNumber(dateValue: string) {
  const day = getDayOfWeek(dateValue);
  const daysFromMonday = day === 0 ? 6 : day - 1;
  return dateDayNumber(dateValue) - daysFromMonday;
}

function getMonthIndex(dateValue: string) {
  const date = parseDateValue(dateValue);
  return date.getFullYear() * 12 + date.getMonth();
}

function addDays(dateValue: string, days: number) {
  const date = parseDateValue(dateValue);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

export function getDayOfWeek(dateValue: string) {
  return parseDateValue(dateValue).getDay();
}

export function getDayOfMonth(dateValue: string) {
  return parseDateValue(dateValue).getDate();
}

export function parseTimeToMinutes(value: string) {
  const match = /^(?<hours>\d{2}):(?<minutes>\d{2})$/.exec(value.trim());

  if (!match?.groups) {
    throw new Error("Time must use HH:mm format");
  }

  const hours = Number(match.groups.hours);
  const minutes = Number(match.groups.minutes);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Time must use HH:mm format");
  }

  return hours * 60 + minutes;
}

export function formatMinutesAsTime(minutes: number | null) {
  if (minutes === null) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function combineDateAndMinutes(dateValue: string, minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return combineDateAndTime(
    dateValue,
    `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
  );
}

export function getRecurringOccurrenceDates(
  schedule: RecurringSchedule,
  windowStart: string,
  windowEnd: string
) {
  const interval = Math.max(1, schedule.interval);
  const rangeStart =
    schedule.startDate > windowStart ? schedule.startDate : windowStart;
  const boundedEnd =
    schedule.endDate && schedule.endDate < windowEnd
      ? schedule.endDate
      : windowEnd;

  if (rangeStart > boundedEnd) {
    return [];
  }

  const dates: string[] = [];
  let cursor = rangeStart;

  while (cursor <= boundedEnd) {
    if (isOccurrenceDate(schedule, cursor, interval)) {
      dates.push(cursor);
    }

    cursor = addDays(cursor, 1);
  }

  return dates;
}

function isOccurrenceDate(
  schedule: RecurringSchedule,
  candidate: string,
  interval: number
) {
  if (candidate < schedule.startDate) {
    return false;
  }

  if (schedule.endDate && candidate > schedule.endDate) {
    return false;
  }

  if (schedule.frequency === "daily") {
    return (dateDayNumber(candidate) - dateDayNumber(schedule.startDate)) % interval === 0;
  }

  if (schedule.frequency === "weekly") {
    const dayOfWeek = schedule.dayOfWeek ?? getDayOfWeek(schedule.startDate);
    const weekDiff =
      (getWeekStartDayNumber(candidate) -
        getWeekStartDayNumber(schedule.startDate)) /
      7;

    return getDayOfWeek(candidate) === dayOfWeek && weekDiff % interval === 0;
  }

  const dayOfMonth = schedule.dayOfMonth ?? getDayOfMonth(schedule.startDate);
  const monthDiff = getMonthIndex(candidate) - getMonthIndex(schedule.startDate);

  return getDayOfMonth(candidate) === dayOfMonth && monthDiff % interval === 0;
}
