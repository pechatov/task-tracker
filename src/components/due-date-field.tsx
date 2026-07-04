"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDisplayDate } from "@/lib/date";

type DueDateFieldProps = {
  defaultValue: string;
  label?: string;
  name?: string;
  placeholder?: string;
};

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric"
});

function parseDisplayDate(value: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? date
    : null;
}

function getMonthGrid(viewMonth: Date) {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function isSameDay(a: Date, b: Date | null) {
  return (
    b !== null &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DueDateField({
  defaultValue,
  label = "Дата выполнения",
  name = "dueDate",
  placeholder = "Без даты — в бэклог"
}: DueDateFieldProps) {
  const [value, setValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(
    () => parseDisplayDate(defaultValue) ?? new Date()
  );
  const wrapperRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function selectDate(date: Date) {
    setValue(formatDisplayDate(date));
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  function openPicker() {
    const selected = parseDisplayDate(value);

    if (!selected) {
      selectDate(new Date());
    } else {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }

    setIsOpen(true);
  }

  function shiftMonth(offset: number) {
    setViewMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  }

  const today = new Date();
  const selected = parseDisplayDate(value);

  return (
    <label className="field due-date-field" ref={wrapperRef}>
      {label}
      <input
        autoComplete="off"
        inputMode="numeric"
        name={name}
        onChange={(event) => setValue(event.target.value)}
        onClick={openPicker}
        onFocus={openPicker}
        pattern="\d{2}-\d{2}-\d{4}"
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {isOpen ? (
        <div className="mini-calendar">
          <div className="mini-calendar-header">
            <button
              aria-label="Предыдущий месяц"
              className="icon-button"
              onClick={() => shiftMonth(-1)}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="mini-calendar-month">
              {monthFormatter.format(viewMonth)}
            </span>
            <button
              aria-label="Следующий месяц"
              className="icon-button"
              onClick={() => shiftMonth(1)}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mini-calendar-grid">
            {weekdayLabels.map((label) => (
              <span className="mini-calendar-weekday" key={label}>
                {label}
              </span>
            ))}
            {getMonthGrid(viewMonth).map((day) => {
              const classNames = ["mini-calendar-day"];

              if (day.getMonth() !== viewMonth.getMonth()) {
                classNames.push("outside");
              }

              if (isSameDay(day, today)) {
                classNames.push("today");
              }

              if (isSameDay(day, selected)) {
                classNames.push("selected");
              }

              return (
                <button
                  className={classNames.join(" ")}
                  key={day.toISOString()}
                  onClick={() => {
                    selectDate(day);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mini-calendar-footer">
            <button
              className="mini-calendar-action"
              onClick={() => {
                selectDate(new Date());
                setIsOpen(false);
              }}
              type="button"
            >
              Сегодня
            </button>
            <button
              className="mini-calendar-action"
              onClick={() => {
                setValue("");
                setIsOpen(false);
              }}
              type="button"
            >
              Без даты
            </button>
          </div>
        </div>
      ) : null}
    </label>
  );
}
