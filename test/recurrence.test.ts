import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gregorianOf, lunarOf } from "../src/lunar.ts";
import { formatWallTime, nextOccurrence, parseWallTime, type Repeat } from "../src/recurrence.ts";

interface Case {
	name: string;
	start: string;
	repeat: Repeat;
	until?: string;
	now: string;
	/** null: the repeat has ended. */
	next: string | null;
}

/** Test data the companion app's tests use too; its repository has identical copies in app/src/test/resources. */
const data = (file: string) => JSON.parse(readFileSync(new URL(`./data/${file}`, import.meta.url), "utf8"));
const cases = data("recurrence-cases.json") as Case[];

for (const c of cases) {
	test(c.name, () => {
		const next = nextOccurrence(parseWallTime(c.start)!, c.repeat, parseWallTime(c.now)!, c.until ?? null);
		assert.equal(next && formatWallTime(next), c.next);
	});
}

test("the lunar table gives every month start the Hong Kong Observatory publishes, 1901–2100", () => {
	const starts = data("chinese-months.json") as [string, number, boolean][];
	let newYear = 0;
	for (const [iso, month, leap] of starts) {
		const [year, m, day] = iso.split("-").map(Number);
		assert.deepEqual(lunarOf({ year, month: m, day }), { month, leap, day: 1 }, iso);
		if (month === 1 && !leap) newYear = year;
		const back = gregorianOf(newYear, { month, leap, day: 1 });
		assert.deepEqual(back, { year, month: m, day }, `${iso} back`);
	}
	assert.equal(lunarOf({ year: 1901, month: 2, day: 18 }), null);
	assert.equal(lunarOf({ year: 2100, month: 2, day: 9 }), null);
});

test("a date alone takes the default time", () => {
	assert.equal(formatWallTime(parseWallTime("2026-10-27", "08:30")!), "2026-10-27T08:30");
});

test("impossible dates are rejected", () => {
	assert.equal(parseWallTime("2026-02-30T09:00"), null);
	assert.equal(parseWallTime("tomorrow"), null);
});
