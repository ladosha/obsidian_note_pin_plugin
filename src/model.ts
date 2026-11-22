import { App, TFile } from "obsidian";
import { KEYS } from "./constants";
import { DATE_LOCALE, t } from "./i18n";
import { lunarOf } from "./lunar";
import {
	isDateOnly,
	nextOccurrence,
	parseWallTime,
	REPEATS,
	toDate,
	wallTimeOf,
	weekdayInMonth,
	type Repeat,
	type WallTime,
} from "./recurrence";

export type ReminderType = "time" | "allday" | "statusbar";

export const REMINDER_TYPES: readonly ReminderType[] = ["time", "allday", "statusbar"];

export interface Reminder {
	type: ReminderType;
	/** "YYYY-MM-DDTHH:mm" for a time reminder, "YYYY-MM-DD" for an all-day one, null for a status bar pin. */
	at: string | null;
	repeat: Repeat;
	/** The last day ("YYYY-MM-DD") a repeating reminder may fire on; absent while it repeats forever. */
	until?: string;
}

export interface NoteInfo {
	file: TFile;
	/** The note's vmnp-id, or its path when it has none. */
	id: string;
	color: string | null;
	pinned: boolean;
	reminder: Reminder | null;
	/** The reminder value a device showed on time (reminder-shown); it counts only while it equals `reminder.at`. */
	shown: string | null;
	subtitle: string | null;
}

/**
 * Where a reminder stands. `due`: a one-off reminder whose time has passed, but not long enough to count as missed
 * (see missedAt). `shown`: a device showed it on time. `missed`: no device showed it on time. `ended`: a repeating
 * reminder past its end date.
 */
export type ReminderStatus = "pin" | "upcoming" | "due" | "shown" | "missed" | "ended";

/** A time reminder no device has confirmed is missed this long after its time. Desktop notifications also count as late after it. */
export const MISSED_AFTER_MS = 5 * 60_000;

/**
 * When a reminder that fired at `when` counts as missed if no device has shown it: 5 minutes later for a time
 * reminder, and midnight at the end of its day for an all-day one, which stays current all day.
 */
export function missedAt(reminder: Reminder, when: Date): number {
	if (reminder.type !== "allday") return when.getTime() + MISSED_AFTER_MS;
	return new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1).getTime();
}

export function noteInfo(app: App, file: TFile): NoteInfo {
	const frontmatter = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
	return {
		file,
		id: asText(frontmatter[KEYS.id]) ?? file.path,
		color: asText(frontmatter[KEYS.color])?.toLowerCase() ?? null,
		pinned: frontmatter[KEYS.pinned] === true || asText(frontmatter[KEYS.pinned]) === "true",
		reminder: readReminder(frontmatter),
		shown: asText(frontmatter[KEYS.shown]),
		subtitle: asText(frontmatter[KEYS.subtitle]),
	};
}

export function allNotes(app: App): NoteInfo[] {
	return app.vault.getMarkdownFiles().map((file) => noteInfo(app, file));
}

/**
 * When a time or all-day reminder fires next; null for status bar pins and for repeats that have ended. One-off
 * reminders may be in the past.
 */
export function nextFire(reminder: Reminder, allDayTime: string, now = new Date()): Date | null {
	if (reminder.type === "statusbar" || !reminder.at) return null;
	const start = parseWallTime(reminder.at, allDayTime);
	const next = start && nextOccurrence(start, reminder.repeat, wallTimeOf(now), reminder.until ?? null);
	return next ? toDate(next) : null;
}

export function reminderStatus(info: NoteInfo, allDayTime: string, now = new Date()): ReminderStatus {
	const reminder = info.reminder;
	if (!reminder || reminder.type === "statusbar") return "pin";
	const when = nextFire(reminder, allDayTime, now);
	if (!when) return reminder.repeat !== "none" && reminder.until ? "ended" : "upcoming";
	if (reminder.repeat !== "none" || when.getTime() > now.getTime()) return "upcoming";
	if (info.shown === reminder.at) return "shown";
	return now.getTime() >= missedAt(reminder, when) ? "missed" : "due";
}

/**
 * "Mon, 27 Oct 2026, 09:00 · every week · until Tue, 15 Dec 2026", "Pinned to the status bar", for a one-off
 * reminder whose time has passed "Reminder shown Mon, 27 Oct 2026, 09:00" or "Was due Mon, 27 Oct 2026, 09:00",
 * and for an ended repeat "Repeated until Tue, 15 Dec 2026".
 */
export function describeReminder(reminder: Reminder, allDayTime: string, status: ReminderStatus = "upcoming"): string {
	if (reminder.type === "statusbar") return t.reminder.pinned;
	const start = reminder.at ? parseWallTime(reminder.at, allDayTime) : null;
	const until = reminder.until ? parseWallTime(reminder.until) : null;
	const untilText = until && formatDate(toDate(until), false);
	const when = nextFire(reminder, allDayTime);
	if (!when || !start) return status === "ended" && untilText ? t.reminder.ended(untilText) : t.reminder.fallback;
	const date = formatDate(when, reminder.type === "time");
	if (status === "shown") return t.reminder.shown(date);
	if (status === "missed") return t.reminder.wasDue(date);
	const parts = [reminder.type === "allday" ? t.reminder.allDay(date) : date];
	if (reminder.repeat !== "none") {
		parts.push(repeatLabel(reminder.repeat, start));
		if (untilText) parts.push(t.reminder.until(untilText));
	}
	return parts.join(" · ");
}

/**
 * How a reminder starting at `start` repeats, with the day it repeats on: "every week on Sunday", "every month on
 * the 15th", "every month on the third Sunday", "every year on November 15", "every year by the Chinese lunar
 * calendar (month 8, day 15)". In lower case, for the middle of a sentence.
 */
export function repeatLabel(repeat: Exclude<Repeat, "none">, start: WallTime): string {
	const { nth, weekday } = weekdayInMonth(start);
	switch (repeat) {
		case "daily":
			return t.reminder.daily;
		case "weekly":
			return t.reminder.weeklyOn(weekday);
		case "biweekly":
			return t.reminder.biweeklyOn(weekday);
		case "monthly":
			return t.reminder.monthlyOn(start.day);
		case "monthly-weekday":
		case "monthly-last-weekday":
			return t.reminder.monthlyWeekday(repeat === "monthly-last-weekday" ? 5 : nth, weekday);
		case "yearly":
			return t.reminder.yearlyOn(start.month, start.day);
		case "yearly-lunar": {
			const lunar = lunarOf(start);
			return lunar
				? t.reminder.yearlyLunar(t.reminder.lunarDate(lunar.month, lunar.leap, lunar.day))
				: t.reminder.yearlyOn(start.month, start.day);
		}
	}
}

/** "Mon, 27 Oct 2026" or "Mon, 27 Oct 2026, 09:00", in the plugin's language (see DATE_LOCALE). */
export function formatDate(date: Date, withTime: boolean): string {
	const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
	if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit" });
	return date.toLocaleString(DATE_LOCALE, options);
}

function readReminder(frontmatter: Record<string, unknown>): Reminder | null {
	const at = asText(frontmatter[KEYS.reminder]);
	const rawType = asText(frontmatter[KEYS.type]);
	let type = REMINDER_TYPES.find((t) => t === rawType) ?? null;
	// A reminder date without a type: a date alone means all day, a date and time means a time reminder.
	if (!type && at) type = isDateOnly(at) ? "allday" : "time";
	if (!type) return null;
	if (type === "statusbar") return { type, at: null, repeat: "none" };
	if (!at || !parseWallTime(at)) return null;
	const rawRepeat = asText(frontmatter[KEYS.repeat]);
	const repeat = REPEATS.find((r) => r === rawRepeat) ?? "none";
	const until = asText(frontmatter[KEYS.until]);
	const reminder: Reminder = { type, at, repeat };
	if (repeat !== "none" && until && isDateOnly(until) && parseWallTime(until)) reminder.until = until.slice(0, 10);
	return reminder;
}

export function asText(value: unknown): string | null {
	if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
	return String(value).trim() || null;
}
