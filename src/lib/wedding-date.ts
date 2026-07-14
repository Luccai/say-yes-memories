export function formatWeddingDate(eventDate: string | undefined, locale: string) {
  if (!eventDate) {
    return "";
  }

  const date = new Date(`${eventDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
