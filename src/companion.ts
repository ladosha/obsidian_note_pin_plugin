import { Notice, ObsidianProtocolData, Platform, debounce } from "obsidian";
import { APP_SCHEME } from "./constants";
import { crc32, fromBase64Url, notePreview, randomId, toBase64Url, trimText } from "./codec";
import { t } from "./i18n";
import { allNotes, missedAt, nextFire, type NoteInfo } from "./model";
import type NotePinPlugin from "./main";

/*
 * Sends every reminder and status bar pin to the Android companion app as one snapshot, by opening a
 * vladmas-note-pin://sync link. An invisible screen in the app applies it and replies by opening
 * obsidian://vladmas-note-pin?op=ack, with the length and checksum it received. The first message from a
 * vault, or one with an unknown token, makes the app ask the user to allow the vault.
 *
 * The reply also lists the one-off reminders the app showed on time (`shown`), which the plugin records in each
 * note's reminder-shown property, so every device can tell a shown reminder from a missed one. After such a
 * reminder's time passes, the next start or resume sends even if nothing else changed, to ask about it.
 *
 * Per-device state lives in Obsidian's local storage for the vault, not in data.json: sync tools copy data.json
 * between devices, so another device would overwrite what this phone last sent.
 */

export type Trigger = "manual" | "startup" | "resume" | "change";

const ACK_TIMEOUT_MS = 15_000;
/** An automatic send the app never confirmed is retried at most this often, so a lost reply can't loop app switches. */
const AUTO_RETRY_MS = 10 * 60_000;
/** Automatic sends wait this long after the last trigger, so a burst of synced changes becomes one send. */
const AUTO_DELAY_MS = 4_000;
/**
 * A passed reminder is asked about once it's this old, so the app's alarm has gone off by then. An all-day reminder
 * is asked about once its day is over, since showing it any time that day counts as on time.
 */
const ASK_AFTER_MS = 60_000;
/** The app remembers what it showed for 30 days; older reminders aren't asked about. */
const ASK_WITHIN_MS = 30 * 24 * 60 * 60_000;
const TITLE_LIMIT = 60;
const PREVIEW_LIMIT = 100;

const KEY_TOKEN = "vladmas-note-pin:token";
const KEY_ACKED = "vladmas-note-pin:acked";
const KEY_ATTEMPT = "vladmas-note-pin:attempt";
const KEY_STATUS = "vladmas-note-pin:status";
/** Passed reminders ("id@at") the app has been asked about, with when. */
const KEY_ASKED = "vladmas-note-pin:asked";

interface SnapshotItem {
	id: string;
	path: string;
	title: string;
	preview: string;
	subtitle: string | null;
	color: string | null;
	type: string;
	at: string | null;
	repeat: string;
	/** The last day a repeating reminder fires on, "YYYY-MM-DD"; absent while it repeats forever. */
	until?: string;
	/** Present when a device already showed this one-off reminder on time, so the app doesn't show it late. */
	shown?: true;
}

/** `full` covers the whole snapshot; `structure` leaves out the note previews. */
interface Fingerprints {
	full: string;
	structure: string;
}

interface PendingSend {
	trigger: Trigger;
	sentAt: number;
	length: number;
	crc: string;
	fingerprints: Fingerprints;
	/** The passed reminders this send asks about. */
	asking: string[];
	timedOut: boolean;
}

/** Why a send failed. Stored as a code, so the settings show it in whatever language Obsidian is in then. */
export type Problem = "no-reply" | "not-allowed" | "unreadable" | "damaged";

export interface CompanionStatus {
	confirmedAt?: number;
	problem?: Problem;
	/** The app's error message, for "unreadable". */
	problemDetail?: string;
	problemAt?: number;
}

/** The problem as the end of a sentence: "the app didn't reply. …" */
export function describeProblem(problem: Problem, detail = ""): string {
	switch (problem) {
		case "no-reply":
			return t.companion.noReply;
		case "not-allowed":
			return t.companion.notAllowed;
		case "unreadable":
			return t.companion.unreadable(detail);
		case "damaged":
			return t.companion.damaged;
	}
}

export class Companion {
	private plugin: NotePinPlugin;
	private pending = new Map<string, PendingSend>();
	private queued = new Set<Trigger>();
	private sendQueued = debounce(
		() => {
			// A start or resume compares the whole snapshot, so it wins over a plain change.
			const trigger = (["startup", "resume", "change"] as const).find((t) => this.queued.has(t)) ?? "change";
			this.queued.clear();
			void this.send(trigger);
		},
		AUTO_DELAY_MS,
		true,
	);

	constructor(plugin: NotePinPlugin) {
		this.plugin = plugin;
	}

	/** Watches for the moments to send. Only Obsidian on Android talks to the app. */
	start() {
		if (!Platform.isAndroidApp) return;
		const { app } = this.plugin;
		app.workspace.onLayoutReady(() => {
			this.queue("startup");
			const onChange = () => this.queue("change");
			this.plugin.registerEvent(app.metadataCache.on("changed", onChange));
			this.plugin.registerEvent(app.vault.on("delete", onChange));
			this.plugin.registerEvent(app.vault.on("rename", onChange));
		});
		this.plugin.registerDomEvent(document, "visibilitychange", () => {
			if (document.visibilityState === "visible") this.queue("resume");
		});
	}

	status(): CompanionStatus {
		return (this.plugin.app.loadLocalStorage(KEY_STATUS) as CompanionStatus | null) ?? {};
	}

	/**
	 * Whether a passed one-off reminder is waiting to be asked about, so it shouldn't show as missed yet. Obsidian
	 * asks on the next start or resume, not while you're using it, so a passed reminder can stay waiting until then.
	 */
	isAsking(info: NoteInfo): boolean {
		if (!Platform.isAndroidApp || !this.plugin.settings.sendAutomatically) return false;
		const key = this.askKey(info, Date.now(), 0);
		return !!key && !(key in this.asked());
	}

	/** Makes a new token, so the app asks to allow this vault again. */
	resetConnection() {
		const { app } = this.plugin;
		app.saveLocalStorage(KEY_TOKEN, null);
		app.saveLocalStorage(KEY_ACKED, null);
		app.saveLocalStorage(KEY_ATTEMPT, null);
	}

	async send(trigger: Trigger) {
		if (!Platform.isAndroidApp) return;
		if (trigger !== "manual" && [...this.pending.values()].some((p) => !p.timedOut)) return;
		const { app } = this.plugin;
		const items = await this.collect();
		const now = Date.now();
		const asked = this.asked();
		const asking = allNotes(app)
			.map((info) => this.askKey(info, now, ASK_AFTER_MS))
			.filter((key): key is string => !!key && !(key in asked));
		const settings = { allDayTime: this.plugin.settings.allDayTime };
		const fingerprints: Fingerprints = {
			full: crc32(JSON.stringify([settings, items])),
			structure: crc32(JSON.stringify([settings, items.map(({ preview, ...rest }) => rest)])),
		};
		if (trigger !== "manual") {
			const acked = app.loadLocalStorage(KEY_ACKED) as Fingerprints | null;
			// Edits only to note text wait for the next start or resume, so typing in a pinned note doesn't keep switching apps.
			const unchanged = trigger === "change" ? acked?.structure === fingerprints.structure : acked?.full === fingerprints.full;
			// Passed reminders are asked about on a start or resume only, like note text.
			if (unchanged && (trigger === "change" || asking.length === 0)) return;
			const attempt = app.loadLocalStorage(KEY_ATTEMPT) as { full: string; asking?: string; at: number } | null;
			const same = attempt?.full === fingerprints.full && (attempt.asking ?? "") === asking.join("\n");
			if (same && now - attempt.at < AUTO_RETRY_MS) return;
		}
		app.saveLocalStorage(KEY_ATTEMPT, { full: fingerprints.full, asking: asking.join("\n"), at: now });

		const req = randomId().slice(0, 8);
		const vault = app.vault.getName();
		const data = toBase64Url(JSON.stringify({ v: 1, req, kind: "snapshot", vault, sentAt: new Date().toISOString(), settings, items }));
		const query = new URLSearchParams({ v: "1", req, vault, token: this.token(), ack: "1", data });
		const pending: PendingSend = {
			trigger,
			sentAt: now,
			length: data.length,
			crc: crc32(data),
			fingerprints,
			asking,
			timedOut: false,
		};
		this.pending.set(req, pending);
		window.setTimeout(() => {
			if (this.pending.get(req) !== pending) return;
			pending.timedOut = true;
			this.recordProblem("no-reply", trigger);
			this.markAsked(pending.asking);
		}, ACK_TIMEOUT_MS);
		window.open(`${APP_SCHEME}://sync?${query.toString()}`);
	}

	/** The app's reply: obsidian://vladmas-note-pin?op=ack&req=…&len=…&crc=…&items=…[&shown=…][&error=…][&warning=…] */
	handleReply(params: ObsidianProtocolData) {
		const pending = this.pending.get(params.req);
		if (!pending) return;
		this.pending.delete(params.req);
		const { app } = this.plugin;
		if (params.shown) this.recordShown(params.shown);
		// Whatever the answer, the app has been asked; a reminder it didn't list as shown now counts as missed.
		this.markAsked(pending.asking);
		if (params.error) {
			if (params.error === "not-allowed") this.recordProblem("not-allowed", pending.trigger);
			else this.recordProblem("unreadable", pending.trigger, params.error);
			return;
		}
		if (Number(params.len) !== pending.length || params.crc !== pending.crc) {
			this.recordProblem("damaged", pending.trigger);
			return;
		}
		app.saveLocalStorage(KEY_ACKED, pending.fingerprints);
		app.saveLocalStorage(KEY_STATUS, { ...this.status(), confirmedAt: Date.now() });
		// The app sends a code for the warnings it knows, so they show in Obsidian's language.
		const warning = params.warning === "notifications-off" ? t.companion.notificationsOff : params.warning;
		if (warning) new Notice(t.companion.appWarning(warning));
		else if (pending.trigger === "manual") new Notice(t.companion.sent(Number(params.items)));
	}

	/** `shown` is base64url JSON: [{ "id": "…", "at": "2026-11-13T18:00" }, …], the reminders' values as sent. */
	private recordShown(shown: string) {
		let entries: unknown;
		try {
			entries = JSON.parse(fromBase64Url(shown));
		} catch {
			return;
		}
		if (!Array.isArray(entries)) return;
		const notes = allNotes(this.plugin.app);
		for (const entry of entries as { id?: unknown; at?: unknown }[]) {
			if (typeof entry?.id !== "string" || typeof entry.at !== "string") continue;
			const info = notes.find((n) => n.id === entry.id);
			if (info) void this.plugin.markShown(info.file, entry.at);
		}
	}

	/**
	 * "id@at" for a one-off reminder that passed (an all-day one: whose day ended) at least `minAge` ago and isn't
	 * known to be shown; null otherwise.
	 */
	private askKey(info: NoteInfo, now: number, minAge: number): string | null {
		const reminder = info.reminder;
		if (!reminder?.at || reminder.type === "statusbar" || reminder.repeat !== "none" || info.shown === reminder.at) return null;
		const when = nextFire(reminder, this.plugin.settings.allDayTime, new Date(now));
		if (!when) return null;
		const from = reminder.type === "allday" ? missedAt(reminder, when) : when.getTime();
		if (now - from < minAge || now - from > ASK_WITHIN_MS) return null;
		return `${info.id}@${reminder.at}`;
	}

	private asked(): Record<string, number> {
		return (this.plugin.app.loadLocalStorage(KEY_ASKED) as Record<string, number> | null) ?? {};
	}

	private markAsked(keys: string[]) {
		if (keys.length === 0) return;
		const now = Date.now();
		const asked = this.asked();
		for (const key of keys) asked[key] = now;
		for (const [key, at] of Object.entries(asked)) if (now - at > ASK_WITHIN_MS) delete asked[key];
		this.plugin.app.saveLocalStorage(KEY_ASKED, asked);
		this.plugin.refreshAll();
	}

	private queue(trigger: Trigger) {
		if (!this.plugin.settings.sendAutomatically) return;
		this.queued.add(trigger);
		this.sendQueued();
	}

	private recordProblem(problem: Problem, trigger: Trigger, detail?: string) {
		const status: CompanionStatus = { ...this.status(), problem, problemDetail: detail, problemAt: Date.now() };
		this.plugin.app.saveLocalStorage(KEY_STATUS, status);
		if (trigger === "manual") new Notice(t.companion.sendFailed(describeProblem(problem, detail)));
	}

	private token(): string {
		const { app } = this.plugin;
		let token = app.loadLocalStorage(KEY_TOKEN) as string | null;
		if (!token) {
			token = randomId();
			app.saveLocalStorage(KEY_TOKEN, token);
		}
		return token;
	}

	private async collect(): Promise<SnapshotItem[]> {
		const { app, settings } = this.plugin;
		const items: SnapshotItem[] = [];
		for (const info of allNotes(app)) {
			if (!info.reminder) continue;
			let preview = "";
			if (settings.showContentInNotifications) {
				const text = await app.vault.cachedRead(info.file);
				const end = app.metadataCache.getFileCache(info.file)?.frontmatterPosition?.end.offset ?? 0;
				preview = notePreview(text.slice(end), PREVIEW_LIMIT);
			}
			const { reminder } = info;
			const item: SnapshotItem = {
				id: info.id,
				path: info.file.path,
				title: trimText(info.file.basename, TITLE_LIMIT),
				preview,
				subtitle: info.subtitle,
				color: info.color,
				type: reminder.type,
				at: reminder.at,
				repeat: reminder.repeat,
			};
			if (reminder.until) item.until = reminder.until;
			if (reminder.repeat === "none" && reminder.at && info.shown === reminder.at) item.shown = true;
			items.push(item);
		}
		return items.sort((a, b) => a.path.localeCompare(b.path));
	}
}
