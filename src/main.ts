import { Notice, ObsidianProtocolData, PaneType, Platform, Plugin, TFile, debounce } from "obsidian";
import { Banners } from "./banner";
import { randomId, trimText } from "./codec";
import { Companion } from "./companion";
import { KEYS, PLUGIN_ACTION } from "./constants";
import { DesktopReminders } from "./desktopReminders";
import { ExplorerDecorations } from "./explorer";
import { t } from "./i18n";
import { ColorModal, ReminderModal } from "./modals";
import { asText, noteInfo, reminderStatus, type NoteInfo, type Reminder, type ReminderStatus } from "./model";
import { NOTES_VIEW, NotesView } from "./notesView";
import { DEFAULT_SETTINGS, SettingsTab, type Settings } from "./settings";

const SUBTITLE_LIMIT = 100;

/** The text a notification shows from a selection: its first line, trimmed. */
function subtitleOf(text: string) {
	return trimText(text.split("\n")[0].trim(), SUBTITLE_LIMIT);
}

export default class NotePinPlugin extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS };
	companion = new Companion(this);
	desktop = new DesktopReminders(this);
	private explorer = new ExplorerDecorations(this);
	private banners = new Banners(this);
	private refreshLater = debounce(() => this.refreshAll(), 300, true);
	/** "path@at" of reminders marked shown in this session, which count as shown before the property is written. */
	private justShown = new Set<string>();

	async onload() {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<Settings> | null) };
		this.registerView(NOTES_VIEW, (leaf) => new NotesView(leaf, this));
		this.addRibbonIcon("palette", t.ribbon.openNotes, () => void this.openNotesView());
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerCommands();
		this.registerMenus();
		this.registerObsidianProtocolHandler(PLUGIN_ACTION, (params) => this.onAppCall(params));

		this.app.workspace.onLayoutReady(() => {
			this.refreshAll();
			const refresh = () => this.refreshLater();
			this.registerEvent(this.app.metadataCache.on("changed", refresh));
			this.registerEvent(this.app.vault.on("create", refresh));
			this.registerEvent(this.app.vault.on("rename", refresh));
			this.registerEvent(this.app.vault.on("delete", refresh));
			this.registerEvent(this.app.workspace.on("layout-change", refresh));
			this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
		});
		// Reminders whose time passes change how their banner looks.
		this.registerInterval(window.setInterval(() => this.banners.refreshAll(), 60_000));
		this.companion.start();
		this.desktop.start();
	}

	onunload() {
		this.explorer.unload();
		this.banners.removeAll();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshAll();
	}

	refreshAll() {
		this.explorer.refresh();
		this.banners.refreshAll();
		for (const leaf of this.app.workspace.getLeavesOfType(NOTES_VIEW)) {
			if (leaf.view instanceof NotesView) leaf.view.refresh();
		}
	}

	async openNote(file: TFile, newLeaf: PaneType | boolean = false) {
		await this.app.workspace.getLeaf(newLeaf).openFile(file);
	}

	async openNotesView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(NOTES_VIEW)[0];
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: NOTES_VIEW, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async setColor(file: TFile, color: string | null) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (color) frontmatter[KEYS.color] = color;
			else delete frontmatter[KEYS.color];
		});
	}

	async togglePinned(file: TFile) {
		const pinned = noteInfo(this.app, file).pinned;
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (pinned) delete frontmatter[KEYS.pinned];
			else frontmatter[KEYS.pinned] = true;
		});
	}

	/**
	 * Sets or removes (null) the reminder, and optionally the text its notification shows. Setting one also gives the
	 * note a stable ID, so links survive renames.
	 */
	async setReminder(file: TFile, reminder: Reminder | null, subtitle?: string) {
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (!reminder || asText(frontmatter[KEYS.shown]) !== reminder.at) delete frontmatter[KEYS.shown];
			if (!reminder) {
				delete frontmatter[KEYS.reminder];
				delete frontmatter[KEYS.type];
				delete frontmatter[KEYS.repeat];
				delete frontmatter[KEYS.until];
				return;
			}
			if (!frontmatter[KEYS.id]) frontmatter[KEYS.id] = randomId();
			frontmatter[KEYS.type] = reminder.type;
			if (reminder.at) frontmatter[KEYS.reminder] = reminder.at;
			else delete frontmatter[KEYS.reminder];
			if (reminder.repeat !== "none") frontmatter[KEYS.repeat] = reminder.repeat;
			else delete frontmatter[KEYS.repeat];
			if (reminder.repeat !== "none" && reminder.until) frontmatter[KEYS.until] = reminder.until;
			else delete frontmatter[KEYS.until];
			if (subtitle) frontmatter[KEYS.subtitle] = subtitle;
		});
	}

	/** Records that a device showed the note's one-off reminder `at` on time, unless the reminder has changed since. */
	async markShown(file: TFile, at: string) {
		const { reminder, shown } = noteInfo(this.app, file);
		if (reminder?.at !== at || reminder.repeat !== "none" || shown === at) return;
		this.justShown.add(`${file.path}@${at}`);
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (asText(frontmatter[KEYS.reminder]) === at) frontmatter[KEYS.shown] = at;
		});
	}

	/** The reminder's status for the banner and the notes list; on Android, a passed reminder stays `due` while the app is asked. */
	reminderStatus(info: NoteInfo): ReminderStatus {
		const status = reminderStatus(info, this.settings.allDayTime);
		if (status !== "missed" && status !== "due") return status;
		if (this.justShown.has(`${info.file.path}@${info.reminder?.at}`)) return "shown";
		return status === "missed" && this.companion.isAsking(info) ? "due" : status;
	}

	async setSubtitle(file: TFile, text: string | null) {
		const subtitle = text ? subtitleOf(text) : null;
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			if (subtitle) frontmatter[KEYS.subtitle] = subtitle;
			else delete frontmatter[KEYS.subtitle];
		});
		new Notice(subtitle ? t.notices.subtitleSet(subtitle) : t.notices.subtitleRemoved);
	}

	private chooseColor(file: TFile) {
		new ColorModal(this.app, noteInfo(this.app, file).color, (color) => void this.setColor(file, color)).open();
	}

	private registerCommands() {
		const withNote = (checking: boolean, run: (file: TFile) => void, when: (file: TFile) => boolean = () => true) => {
			const file = this.app.workspace.getActiveFile();
			if (!file || file.extension !== "md" || !when(file)) return false;
			if (!checking) run(file);
			return true;
		};
		this.addCommand({ id: "open-notes-list", name: t.commands.openNotesList, callback: () => void this.openNotesView() });
		this.addCommand({ id: "set-color", name: t.commands.setColor, checkCallback: (c) => withNote(c, (f) => this.chooseColor(f)) });
		this.addCommand({
			id: "toggle-pinned",
			name: t.commands.togglePinned,
			checkCallback: (c) => withNote(c, (f) => void this.togglePinned(f)),
		});
		this.addCommand({
			id: "set-reminder",
			name: t.commands.setReminder,
			checkCallback: (c) => withNote(c, (f) => new ReminderModal(this, f, noteInfo(this.app, f).reminder).open()),
		});
		this.addCommand({
			id: "remove-reminder",
			name: t.commands.removeReminder,
			checkCallback: (c) =>
				withNote(
					c,
					(f) => void this.setReminder(f, null),
					(f) => !!noteInfo(this.app, f).reminder,
				),
		});
		this.addCommand({
			id: "toggle-status-bar-pin",
			name: t.commands.toggleStatusBarPin,
			checkCallback: (c) =>
				withNote(c, (f) => {
					const pinned = noteInfo(this.app, f).reminder?.type === "statusbar";
					void this.setReminder(f, pinned ? null : { type: "statusbar", at: null, repeat: "none" });
				}),
		});
		this.addCommand({
			id: "set-reminder-with-selection",
			name: t.commands.setReminderWithSelection,
			editorCheckCallback: (checking, editor, ctx) => {
				const selection = editor.getSelection().trim();
				if (!selection || !ctx.file) return false;
				if (!checking) new ReminderModal(this, ctx.file, noteInfo(this.app, ctx.file).reminder, subtitleOf(selection)).open();
				return true;
			},
		});
		this.addCommand({
			id: "use-selection-as-subtitle",
			name: t.commands.useSelectionAsSubtitle,
			editorCheckCallback: (checking, editor, ctx) => {
				const selection = editor.getSelection().trim();
				if (!selection || !ctx.file) return false;
				if (!checking) void this.setSubtitle(ctx.file, selection);
				return true;
			},
		});
		this.addCommand({
			id: "send-to-companion",
			name: t.commands.sendToCompanion,
			checkCallback: (checking) => {
				if (!Platform.isAndroidApp) return false;
				if (!checking) void this.companion.send("manual");
				return true;
			},
		});
	}

	private registerMenus() {
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const info = noteInfo(this.app, file);
				menu.addItem((item) =>
					item
						.setTitle(t.menu.setColor)
						.setIcon("palette")
						.setSection("note-pin")
						.onClick(() => this.chooseColor(file)),
				);
				menu.addItem((item) =>
					item
						.setTitle(info.pinned ? t.menu.unpinFromTop : t.menu.pinToTop)
						.setIcon(info.pinned ? "pin-off" : "pin")
						.setSection("note-pin")
						.onClick(() => void this.togglePinned(file)),
				);
				menu.addItem((item) =>
					item
						.setTitle(info.reminder ? t.menu.editReminder : t.menu.setReminder)
						.setIcon("alarm-clock")
						.setSection("note-pin")
						.onClick(() => new ReminderModal(this, file, info.reminder).open()),
				);
			}),
		);
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, ctx) => {
				const selection = editor.getSelection().trim();
				const file = ctx.file;
				if (!selection || !file) return;
				menu.addItem((item) =>
					item
						.setTitle(t.menu.setReminderWithText)
						.setIcon("alarm-clock")
						.setSection("note-pin")
						.onClick(() => new ReminderModal(this, file, noteInfo(this.app, file).reminder, subtitleOf(selection)).open()),
				);
				menu.addItem((item) =>
					item
						.setTitle(t.menu.useAsSubtitle)
						.setIcon("bell")
						.setSection("note-pin")
						.onClick(() => void this.setSubtitle(file, selection)),
				);
			}),
		);
	}

	/** Calls from the companion app: obsidian://vladmas-note-pin?op=ack|open&… */
	private onAppCall(params: ObsidianProtocolData) {
		if (params.op === "ack") {
			this.companion.handleReply(params);
		} else if (params.op === "open") {
			const files = this.app.vault.getMarkdownFiles();
			const byId = params.id ? files.find((f) => noteInfo(this.app, f).id === params.id) : undefined;
			const byPath = params.path ? this.app.vault.getAbstractFileByPath(params.path) : null;
			const file = byId ?? (byPath instanceof TFile ? byPath : null);
			if (file) void this.openNote(file);
			else new Notice(t.notices.noteMissing);
		}
	}
}
