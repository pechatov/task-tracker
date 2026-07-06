export const APP_TIME_ZONE = "Europe/Moscow";

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const moscowDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: APP_TIME_ZONE,
  year: "numeric"
});

function parseDateParts(dateValue: string) {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(
    dateValue
  );

  if (!match?.groups) {
    return null;
  }

  return {
    day: Number(match.groups.day),
    month: Number(match.groups.month),
    year: Number(match.groups.year)
  };
}

function isValidDateParts(year: number, month: number, day: number) {
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function getMoscowDateParts(date: Date): DateParts {
  const parts = Object.fromEntries(
    moscowDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    second: parts.second,
    year: parts.year
  };
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = getMoscowDateParts(date);
  const zonedTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getMilliseconds()
  );

  return zonedTimestamp - date.getTime();
}

function dateFromMoscowParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess);
  const result = new Date(utcGuess.getTime() - offset);
  const adjustedOffset = getTimeZoneOffsetMs(result);

  return adjustedOffset === offset
    ? result
    : new Date(utcGuess.getTime() - adjustedOffset);
}

export function formatDateInput(date = new Date()) {
  const { day, month, year } = getMoscowDateParts(date);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

export function formatDateValue(dateValue: string | Date) {
  if (typeof dateValue === "string") {
    const parts = parseDateParts(dateValue);

    if (!parts || !isValidDateParts(parts.year, parts.month, parts.day)) {
      return "";
    }

    return `${String(parts.day).padStart(2, "0")}-${String(parts.month).padStart(
      2,
      "0"
    )}-${parts.year}`;
  }

  if (Number.isNaN(dateValue.getTime())) {
    return "";
  }

  const { day, month, year } = getMoscowDateParts(dateValue);

  return `${String(day).padStart(2, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${year}`;
}

export function parseDateInputValue(value: string, fallback = formatDateInput()) {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  const displayMatch = /^(?<day>\d{2})-(?<month>\d{2})-(?<year>\d{4})$/.exec(
    trimmed
  );

  if (displayMatch?.groups) {
    const { day, month, year } = displayMatch.groups;

    if (
      isValidDateParts(Number(year), Number(month), Number(day))
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  const isoMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(
    trimmed
  );

  if (isoMatch?.groups) {
    const { day, month, year } = isoMatch.groups;

    if (
      isValidDateParts(Number(year), Number(month), Number(day))
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  throw new Error("Date must use dd-mm-yyyy format");
}

export function formatTimeInput(date: Date | null) {
  if (!date) {
    return "";
  }

  const { hour, minute } = getMoscowDateParts(date);
  const hours = String(hour).padStart(2, "0");
  const minutes = String(minute).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  const dateParts = parseDateParts(dateValue);
  const timeMatch = /^(?<hour>\d{2}):(?<minute>\d{2})$/.exec(timeValue);

  if (!dateParts || !timeMatch?.groups) {
    return new Date(Number.NaN);
  }

  const hour = Number(timeMatch.groups.hour);
  const minute = Number(timeMatch.groups.minute);

  if (
    !isValidDateParts(dateParts.year, dateParts.month, dateParts.day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return new Date(Number.NaN);
  }

  return dateFromMoscowParts(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    hour,
    minute
  );
}

export function formatDisplayDate(dateValue: string | Date) {
  return formatDateValue(dateValue);
}

export function formatDisplayTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function startOfMoscowDate(dateValue: string) {
  const parts = parseDateParts(dateValue);

  if (!parts || !isValidDateParts(parts.year, parts.month, parts.day)) {
    return new Date(Number.NaN);
  }

  return dateFromMoscowParts(parts.year, parts.month, parts.day);
}

export function endOfMoscowDate(dateValue: string) {
  const start = startOfMoscowDate(dateValue);

  if (Number.isNaN(start.getTime())) {
    return start;
  }

  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
