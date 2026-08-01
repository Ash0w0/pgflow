const DAY_MS = 86_400_000;

function addCalendarDays(dateText: string, days: number) {
  const noonInKolkata = new Date(`${dateText}T12:00:00+05:30`);
  return new Date(noonInKolkata.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function getWeeklyReportWindow(weekStart: string, now = new Date()) {
  const weekEnd = addCalendarDays(weekStart, 7);
  const completedAt = new Date(`${weekEnd}T00:00:00+05:30`);
  const expiresAt = new Date(
    new Date(`${weekStart}T12:00:00+05:30`).getTime() + 8 * DAY_MS,
  );
  const blockers: string[] = [];
  if (completedAt.getTime() > now.getTime()) {
    blockers.push("This week is still in progress. Preview a completed Monday-to-Sunday week.");
  }
  if (expiresAt.getTime() <= now.getTime()) {
    blockers.push("This report is past its delivery window and can no longer be queued.");
  }
  return {
    weekEnd,
    completedAt: completedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    blockers,
  };
}
