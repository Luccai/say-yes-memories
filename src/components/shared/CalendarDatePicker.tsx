"use client";

import "react-day-picker/style.css";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  DayPicker,
  type DropdownNavProps,
  type DropdownProps,
} from "react-day-picker";
import {
  de,
  enUS,
  es,
  fr,
  pt,
  tr,
  zhCN,
  type DayPickerLocale,
} from "react-day-picker/locale";
import {
  calendarDateFromIso,
  calendarDateToIso,
} from "@/lib/calendar-date";

type CalendarDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  locale: string;
  min?: string;
  max?: string;
  startMonth?: Date;
  endMonth?: Date;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

const calendarLocales: Record<string, DayPickerLocale> = {
  en: enUS,
  es,
  fr,
  de,
  pt,
  tr,
  zh: zhCN,
};

function resolveCalendarLocale(locale: string) {
  const language = locale.toLowerCase().split("-")[0];
  return calendarLocales[language] ?? enUS;
}

function CalendarDropdown({ options, className, ...props }: DropdownProps) {
  return (
    <select
      {...props}
      className={`studio-calendar-select ${className ?? ""}`}
    >
      {options?.map((option) => (
        <option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CalendarDropdownNav({ className, ...props }: DropdownNavProps) {
  return <div {...props} className={`studio-calendar-dropdowns ${className ?? ""}`} />;
}

function formatSelectedDate(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(value);
}

type CalendarMonthsProps = {
  onChange: (value: string) => void;
  locale: string;
  disabled?: boolean;
  required?: boolean;
  selected: Date | undefined;
  minDate: Date | undefined;
  maxDate: Date | undefined;
  firstMonth: Date;
  lastMonth: Date;
};

function CalendarMonths({
  onChange,
  locale,
  disabled = false,
  required = false,
  selected,
  minDate,
  maxDate,
  firstMonth,
  lastMonth,
}: CalendarMonthsProps) {
  const [month, setMonth] = useState(() => selected ?? minDate ?? new Date());
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <DayPicker
      animate
      captionLayout="dropdown"
      className="w-full"
      components={{ Dropdown: CalendarDropdown, DropdownNav: CalendarDropdownNav }}
      disabled={disabled ? true : disabledDays}
      endMonth={lastMonth}
      hideNavigation
      locale={resolveCalendarLocale(locale)}
      mode="single"
      month={month}
      onMonthChange={setMonth}
      onSelect={(nextDate) => {
        if (!nextDate) {
          if (!required) onChange("");
          return;
        }

        setMonth(nextDate);
        onChange(calendarDateToIso(nextDate));
      }}
      reverseYears
      selected={selected}
      startMonth={firstMonth}
    />
  );
}

export function CalendarDatePicker({
  value,
  onChange,
  label,
  locale,
  min,
  max,
  startMonth,
  endMonth,
  disabled = false,
  required = false,
  className = "",
}: CalendarDatePickerProps) {
  const selected = calendarDateFromIso(value);
  const minDate = calendarDateFromIso(min);
  const maxDate = calendarDateFromIso(max);
  const firstMonth = startMonth ?? minDate ?? new Date(1980, 0, 1);
  const lastMonth = endMonth ?? maxDate ?? new Date(new Date().getFullYear() + 20, 11, 1);
  return (
    <div
      aria-label={label}
      data-studio-calendar="true"
      className={`studio-calendar ${className}`}
    >
      <p aria-live="polite" className="studio-calendar-selected">
        <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        {selected ? formatSelectedDate(selected, locale) : label}
      </p>
      <CalendarMonths
        key={value}
        onChange={onChange}
        locale={locale}
        disabled={disabled}
        required={required}
        selected={selected}
        minDate={minDate}
        maxDate={maxDate}
        firstMonth={firstMonth}
        lastMonth={lastMonth}
      />
    </div>
  );
}
