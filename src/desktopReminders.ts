import { Notice, Platform } from "obsidian";
import { notePreview } from "./codec";
import { t } from "./i18n";
import { allNotes, missedAt, type NoteInfo } from "./model";
import { formatWallTime, nextOccurrence, parseWallTime, toDate, wallTimeOf } from "./recurrence";
import type NotePinPlugin from "./main";

const KEY_ENABLED = "vladmas-note-pin:desktop-notifications";
const KEY_LAST_CHECK = "vladmas-note-pin:desktop-last-check";
const KEY_FIRED = "vladmas-note-pin:desktop-fired";

const CHECK_INTERVAL_MS = 15_000;
/** Reminders that came due while Obsidian was closed are shown on start, up to this far back. */
const CATCH_UP_MS = 24 * 60 * 60_000;
const FORGET_FIRED_MS = 30 * 24 * 60 * 60_000;
const PREVIEW_LIMIT = 100;

/**
 * Reminders on desktop, while Obsidian is open: a system notification plus an Obsidian notice, both of which
 * open the note when clicked. The on/off switch and what has fired are per device (local storage), so two
 * computers can be set up differently.
 */
export class DesktopReminders {
	private plugin: NotePinPlugin;

	constructor(plugin: NotePinPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Stored as "on" or "off": saveLocalStorage removes the key for a falsy value, so a stored false would read back
	 * as "never set", which means on.
	 */
	get enabled(): boolean {
		return this.plugin.app.loadLocalStorage(KEY_ENABLED) !== "off";
	}

	setEnabled(enabled: boolean) {
		this.plugin.app.saveLocalStorage(KEY_ENABLED, enabled ? "on" : "off");
	}

	start() {
		if (!Platform.isDesktopApp) return;
		this.plugin.app.workspace.onLayoutReady(() => {
			this.check();
			this.plugin.registerInterval(window.setInterval(() => this.check(), CHECK_INTERVAL_MS));
		});
	}

	/** Shows every occurrence that came due since the last check. */
	check() {
		const { app, settings } = this.plugin;
		const now = Date.now();
		const lastCheck = (app.loadLocalStorage(KEY_LAST_CHECK) as number | null) ?? now;
		app.saveLocalStorage(KEY_LAST_CHECK, now);
		if (!this.enabled) return;
		const since = wallTimeOf(new Date(Math.max(lastCheck, now - CATCH_UP_MS)));
		const sinceMs = toDate(since).getTime();
		const fired = (app.loadLocalStorage(KEY_FIRED) as Record<string, number> | null) ?? {};
		let changed = false;
		for (const info of allNotes(app)) {
			const reminder = info.reminder;
			if (!reminder?.at || reminder.type === "statusbar") continue;
			const start = parseWallTime(reminder.at, settings.allDayTime);
			if (!start) continue;
			const occurrence = nextOccurrence(start, reminder.repeat, since, reminder.until ?? null);
			if (!occurrence) continue;
			const when = toDate(occurrence).getTime();
			if (when < sinceMs || when > now) continue;
			const key = `${info.id}@${formatWallTime(occurrence)}`;
			if (fired[key]) continue;
			fired[key] = now;
			changed = true;
			// Shown later than missedAt, the notification says "Missed reminder". Chromium slows timers in background
			// windows, so a minute's delay is normal.
			const missed = now >= missedAt(reminder, new Date(when));
			void this.notify(info, missed);
			if (!missed && reminder.repeat === "none") void this.plugin.markShown(info.file, reminder.at);
		}
		if (!changed) return;
		for (const [key, at] of Object.entries(fired)) if (now - at > FORGET_FIRED_MS) delete fired[key];
		app.saveLocalStorage(KEY_FIRED, fired);
	}

	private async notify(info: NoteInfo, missed: boolean) {
		const { app, settings } = this.plugin;
		let body = info.subtitle ?? "";
		if (!body && settings.showContentInNotifications) {
			const text = await app.vault.cachedRead(info.file);
			const end = app.metadataCache.getFileCache(info.file)?.frontmatterPosition?.end.offset ?? 0;
			body = notePreview(text.slice(end), PREVIEW_LIMIT);
		}
		if (missed) body = body ? t.reminder.missedWith(body) : t.reminder.missed;
		const title = info.file.basename;
		const open = () => {
			window.focus();
			void this.plugin.openNote(info.file);
		};
		const notice = new Notice(body ? `⏰ ${title}\n${body}` : `⏰ ${title}`, 0);
		notice.noticeEl.addEventListener("click", open);
		if (typeof Notification === "undefined") return;
		if (Notification.permission === "default") await Notification.requestPermission();
		if (Notification.permission !== "granted") return;
		const notification = new Notification(title, { body });
		notification.onclick = () => {
			notice.hide();
			open();
		};
	}
}
