export function formatDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateValue(dateValue: string | Date) {
  const date =
    dateValue instanceof Date ? dateValue : new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
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
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);

    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() + 1 === Number(month) &&
      parsed.getDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  const isoMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(
    trimmed
  );

  if (isoMatch?.groups) {
    const { day, month, year } = isoMatch.groups;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);

    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === Number(year) &&
      parsed.getMonth() + 1 === Number(month) &&
      parsed.getDate() === Number(day)
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

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue}:00`);
}

export function formatDisplayDate(dateValue: string | Date) {
  return formatDateValue(dateValue);
}

export function formatDisplayTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
