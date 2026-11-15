import { DropdownComponent, ItemView, Keymap, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import { colorHex, colorRank } from "./constants";
import { DATE_LOCALE, t } from "./i18n";
import { allNotes, describeReminder, nextFire, type NoteInfo } from "./model";
import type { ListFilter, ListSort } from "./settings";
import type NotePinPlugin from "./main";

export const NOTES_VIEW = "vladmas-note-pin-notes";

const PAGE_SIZE = 200;

/** A list of notes: colored rows, pinned notes first, sortable by color. */
export class NotesView extends ItemView {
	private plugin: NotePinPlugin;
	private query = "";
	private limit = PAGE_SIZE;
	private listEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: NotePinPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return NOTES_VIEW;
	}

	getDisplayText() {
		return t.notesView.title;
	}

	getIcon() {
		return "palette";
	}

	async onOpen() {
		const { contentEl, plugin } = this;
		contentEl.empty();
		contentEl.addClass("cr-notes-view");
		const controls = contentEl.createDiv({ cls: "cr-notes-controls" });
		const search = controls.createEl("input", { type: "search", placeholder: t.notesView.search, cls: "cr-notes-search" });
		search.addEventListener("input", () => {
			this.query = search.value.trim().toLowerCase();
			this.limit = PAGE_SIZE;
			this.render();
		});
		const selects = controls.createDiv({ cls: "cr-notes-selects" });
		new DropdownComponent(selects)
			.addOptions(t.notesView.filters)
			.setValue(plugin.settings.listFilter)
			.onChange(async (value) => {
				plugin.settings.listFilter = value as ListFilter;
				await plugin.saveSettings();
			});
		new DropdownComponent(selects)
			.addOptions(t.notesView.sorts)
			.setValue(plugin.settings.listSort)
			.onChange(async (value) => {
				plugin.settings.listSort = value as ListSort;
				await plugin.saveSettings();
			});
		this.listEl = contentEl.createDiv({ cls: "cr-notes-list" });
		this.render();
	}

	async onClose() {
		this.listEl = null;
	}

	refresh() {
		this.render();
	}

	private render() {
		const listEl = this.listEl;
		if (!listEl) return;
		const { app, settings } = this.plugin;
		const notes = allNotes(app).filter((n) => this.matches(n));
		notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || this.compare(a, b));
		listEl.empty();
		if (notes.length === 0) {
			listEl.createDiv({ cls: "cr-notes-empty", text: this.query ? t.notesView.noMatch : t.notesView.empty });
			return;
		}
		const active = app.workspace.getActiveFile()?.path;
		for (const info of notes.slice(0, this.limit)) this.renderRow(listEl, info, info.file.path === active, settings.allDayTime);
		if (notes.length > this.limit) {
			const more = listEl.createEl("button", { cls: "cr-notes-more", text: t.notesView.showMore(notes.length - this.limit) });
			more.addEventListener("click", () => {
				this.limit += PAGE_SIZE;
				this.render();
			});
		}
	}

	private renderRow(listEl: HTMLElement, info: NoteInfo, active: boolean, allDayTime: string) {
		const row = listEl.createDiv({ cls: "cr-note-row" });
		row.toggleClass("is-active", active);
		const hex = colorHex(info.color);
		if (hex) {
			row.addClass("has-color");
			row.style.setProperty("--cr-note-color", hex);
		}
		row.createDiv({ cls: "cr-note-stripe" });
		const body = row.createDiv({ cls: "cr-note-body" });
		const title = body.createDiv({ cls: "cr-note-title" });
		if (info.pinned) setIcon(title.createSpan({ cls: "cr-note-icon", attr: { "aria-label": t.notesView.pinned } }), "pin");
		title.createSpan({ text: info.file.basename });
		const meta = body.createDiv({ cls: "cr-note-meta" });
		const reminder = info.reminder;
		if (reminder) {
			const icon = reminder.type === "statusbar" ? "smartphone" : reminder.type === "allday" ? "calendar" : "alarm-clock";
			setIcon(meta.createSpan({ cls: "cr-note-icon" }), icon);
			const status = this.plugin.reminderStatus(info);
			meta.createSpan({ text: describeReminder(reminder, allDayTime, status) });
			meta.toggleClass("is-missed", status === "missed");
			meta.toggleClass("is-ended", status === "ended");
		} else {
			const folder = info.file.parent && !info.file.parent.isRoot() ? `${info.file.parent.path} · ` : "";
			const edited = new Date(info.file.stat.mtime).toLocaleDateString(DATE_LOCALE, { day: "numeric", month: "short", year: "numeric" });
			meta.setText(folder + edited);
		}
		row.addEventListener("click", (evt) => void this.plugin.openNote(info.file, Keymap.isModEvent(evt)));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			const menu = new Menu();
			this.app.workspace.trigger("file-menu", menu, info.file, "vladmas-note-pin-list");
			menu.showAtMouseEvent(evt);
		});
	}

	private matches(info: NoteInfo): boolean {
		if (this.query && !info.file.basename.toLowerCase().includes(this.query)) return false;
		switch (this.plugin.settings.listFilter) {
			case "colored":
				return !!colorHex(info.color);
			case "reminders":
				return !!info.reminder;
			case "pinned":
				return info.pinned;
			default:
				return true;
		}
	}

	private compare(a: NoteInfo, b: NoteInfo): number {
		const byTitle = a.file.basename.localeCompare(b.file.basename);
		switch (this.plugin.settings.listSort) {
			case "title":
				return byTitle;
			case "color":
				return colorRank(a.color) - colorRank(b.color) || byTitle;
			case "reminder":
				return this.reminderOrder(a) - this.reminderOrder(b) || byTitle;
			default:
				return b.file.stat.mtime - a.file.stat.mtime;
		}
	}

	/** Status bar pins first, then by next fire time, then notes without reminders. */
	private reminderOrder(info: NoteInfo): number {
		if (!info.reminder) return Number.MAX_SAFE_INTEGER;
		if (info.reminder.type === "statusbar") return 0;
		return nextFire(info.reminder, this.plugin.settings.allDayTime)?.getTime() ?? Number.MAX_SAFE_INTEGER - 1;
	}
}
