/*
 * Reminder times are wall-clock times ("2026-10-27T09:00"), not instants: a daily 09:00 reminder stays at
 * 09:00 across daylight-saving changes and time zones. The companion app has the same rules in Kotlin
 * (Schedule.kt); both are checked against the same cases, test/data/recurrence-cases.json here.
 */

// With the extension, because the tests run this file in Node, which needs it.
import { gregorianOf, lunarOf } from "./lunar.ts";

/**
 * How a reminder repeats, as stored in reminder-repeat. The weekday and lunar rules take their day from the
 * reminder's own date: "monthly-weekday" on 15 November 2026, the third Sunday, repeats on every third Sunday.
 */
export type Repeat =
	| "none"
	| "daily"
	| "weekly"
	| "biweekly"
	| "monthly"
	| "monthly-weekday"
	| "monthly-last-weekday"
	| "yearly"
	| "yearly-lunar";

export const REPEATS: readonly Repeat[] = [
	"none",
	"daily",
	"weekly",
	"biweekly",
	"monthly",
	"monthly-weekday",
	"monthly-last-weekday",
	"yearly",
	"yearly-lunar",
];

export interface WallTime {
	year: number;
	/** 1–12 */
	month: number;
	day: number;
	hour: number;
	minute: number;
}

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; a date alone takes `defaultTime` ("HH:mm"). */
export function parseWallTime(text: string, defaultTime = "00:00"): WallTime | null {
	const match = WALL_TIME.exec(text.trim());
	if (!match) return null;
	const [hour, minute] = match[4] ? [Number(match[4]), Number(match[5])] : parseClock(defaultTime);
	const time = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour, minute };
	return isValid(time) ? time : null;
}

export function isDateOnly(text: string): boolean {
	const match = WALL_TIME.exec(text.trim());
	return !!match && !match[4];
}

/** "HH:mm" as [hour, minute]; anything unreadable is 09:00. */
export function parseClock(text: string): [number, number] {
	const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
	if (!match) return [9, 0];
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	return hour < 24 && minute < 60 ? [hour, minute] : [9, 0];
}

export function formatWallTime(time: WallTime): string {
	return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}T${pad(time.hour)}:${pad(time.minute)}`;
}

export function formatDate(time: WallTime): string {
	return formatWallTime(time).slice(0, 10);
}

export function wallTimeOf(date: Date): WallTime {
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
		hour: date.getHours(),
		minute: date.getMinutes(),
	};
}

/** The local instant for a wall time. */
export function toDate(time: WallTime): Date {
	return new Date(time.year, time.month - 1, time.day, time.hour, time.minute);
}

/**
 * The first occurrence at or after `now`. A one-off reminder returns its own time, even if it's past. A repeating
 * one returns null once it has ended: `until` ("YYYY-MM-DD") is the last day it may fire on.
 */
export function nextOccurrence(start: WallTime, repeat: Repeat, now: WallTime, until: string | null = null): WallTime | null {
	if (repeat === "none") return start;
	const next = compare(start, now) >= 0 ? start : repeatAfter(start, repeat, now);
	return next && (!until || formatDate(next) <= until) ? next : null;
}

/** Which of its month's weekdays a date is: the third Sunday is { nth: 3, weekday: 0 }. `last`: no later one this month. */
export function weekdayInMonth(time: WallTime): { nth: number; weekday: number; last: boolean } {
	return {
		nth: Math.ceil(time.day / 7),
		weekday: weekdayOf(time.year, time.month, time.day),
		last: time.day + 7 > daysInMonth(time.year, time.month),
	};
}

/** The first occurrence at or after `now`, for a repeating reminder that started before it. */
function repeatAfter(start: WallTime, repeat: Exclude<Repeat, "none">, now: WallTime): WallTime | null {
	switch (repeat) {
		case "daily":
		case "weekly":
		case "biweekly": {
			const step = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 14;
			const elapsedDays = Math.floor((minutesOf(now) - minutesOf(start)) / MINUTES_PER_DAY);
			let steps = Math.floor(elapsedDays / step);
			let candidate = addDays(start, steps * step);
			while (compare(candidate, now) < 0) candidate = addDays(start, ++steps * step);
			return candidate;
		}
		case "monthly":
		case "yearly": {
			const monthsPerStep = repeat === "monthly" ? 1 : 12;
			const elapsedMonths = (now.year - start.year) * 12 + (now.month - start.month);
			let steps = Math.max(0, Math.floor(elapsedMonths / monthsPerStep) - 1);
			let candidate = addMonths(start, steps * monthsPerStep);
			while (compare(candidate, now) < 0) candidate = addMonths(start, ++steps * monthsPerStep);
			return candidate;
		}
		case "monthly-weekday":
		case "monthly-last-weekday": {
			const { nth, weekday } = weekdayInMonth(start);
			// A fifth weekday becomes the last one, since most months don't have a fifth.
			const last = repeat === "monthly-last-weekday" || nth === 5;
			// Start a month early: this month's may still be ahead.
			for (let index = now.year * 12 + now.month - 2; ; index++) {
				const year = Math.floor(index / 12);
				const month = (index % 12) + 1;
				const day = last ? lastWeekday(year, month, weekday) : nthWeekday(year, month, weekday, nth);
				const candidate = { year, month, day, hour: start.hour, minute: start.minute };
				if (compare(candidate, now) >= 0) return candidate;
			}
		}
		case "yearly-lunar": {
			const lunar = lunarOf(start);
			if (!lunar) return null;
			// Lunar years start in late January or February, so the lunar year that started the Gregorian year before
			// may still be running.
			for (let year = now.year - 1; year <= now.year + 1; year++) {
				const date = gregorianOf(year, lunar);
				if (!date) continue;
				const candidate = { ...date, hour: start.hour, minute: start.minute };
				if (compare(candidate, now) >= 0) return candidate;
			}
			return null;
		}
	}
}

export function compare(a: WallTime, b: WallTime): number {
	return minutesOf(a) - minutesOf(b);
}

const MINUTES_PER_DAY = 24 * 60;

/** Minutes since 1970 on a clock without daylight saving, so day arithmetic never drifts. */
function minutesOf(time: WallTime): number {
	return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) / 60_000;
}

function addDays(time: WallTime, days: number): WallTime {
	const date = new Date(Date.UTC(time.year, time.month - 1, time.day + days, time.hour, time.minute));
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate(),
		hour: time.hour,
		minute: time.minute,
	};
}

/** Keeps the original day of the month, falling back to the month's last day (Jan 31 → Feb 28 → Mar 31). */
function addMonths(time: WallTime, months: number): WallTime {
	const index = time.year * 12 + (time.month - 1) + months;
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;
	return { year, month, day: Math.min(time.day, daysInMonth(year, month)), hour: time.hour, minute: time.minute };
}

function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 for Sunday to 6 for Saturday. */
function weekdayOf(year: number, month: number, day: number): number {
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The day of the month of its `nth` (1–4) `weekday`. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
	return 1 + ((weekday - weekdayOf(year, month, 1) + 7) % 7) + 7 * (nth - 1);
}

/** The day of the month of its last `weekday`. */
function lastWeekday(year: number, month: number, weekday: number): number {
	const end = daysInMonth(year, month);
	return end - ((weekdayOf(year, month, end) - weekday + 7) % 7);
}

function isValid(time: WallTime): boolean {
	return (
		time.month >= 1 &&
		time.month <= 12 &&
		time.day >= 1 &&
		time.day <= daysInMonth(time.year, time.month) &&
		time.hour < 24 &&
		time.minute < 60
	);
}

function pad(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}
