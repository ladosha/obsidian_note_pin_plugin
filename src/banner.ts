import { MarkdownView, Platform, setIcon } from "obsidian";
import { colorHex } from "./constants";
import { t } from "./i18n";
import { describeReminder, noteInfo, type NoteInfo, type Reminder } from "./model";
import { ReminderModal } from "./modals";
import type NotePinPlugin from "./main";

const BANNER_CLASS = "cr-banner";

/** A strip at the top of each open note that has a reminder, showing when it fires, with Edit and Remove. */
export class Banners {
	private plugin: NotePinPlugin;
	private observers = new Map<HTMLElement, MutationObserver>();

	constructor(plugin: NotePinPlugin) {
		this.plugin = plugin;
	}

	refreshAll() {
		// Forget containers of notes that were closed.
		for (const [container, observer] of this.observers) {
			if (!container.isConnected) {
				observer.disconnect();
				this.observers.delete(container);
			}
		}
		for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView) this.render(leaf.view);
		}
	}

	removeAll() {
		this.observers.forEach((observer) => observer.disconnect());
		this.observers.clear();
		document.querySelectorAll(`.${BANNER_CLASS}`).forEach((el) => el.remove());
	}

	private render(view: MarkdownView) {
		const info = view.file ? noteInfo(this.plugin.app, view.file) : null;
		for (const container of this.containers(view)) {
			const existing = container.querySelector<HTMLElement>(`:scope > .${BANNER_CLASS}`);
			if (!info?.reminder) {
				existing?.remove();
				continue;
			}
			const banner = existing ?? createDiv({ cls: BANNER_CLASS });
			if (container.firstElementChild !== banner) container.prepend(banner);
			this.fill(banner, info, info.reminder);
			if (Platform.isMobile) this.observe(container, view);
		}
	}

	/** Obsidian redraws the note's text, removing the banner on mobile, where it lives inside it; put it back. */
	private observe(container: HTMLElement, view: MarkdownView) {
		if (this.observers.has(container)) return;
		const observer = new MutationObserver(() => {
			if (!container.firstElementChild?.classList.contains(BANNER_CLASS)) this.render(view);
		});
		observer.observe(container, { childList: true });
		this.observers.set(container, observer);
	}

	/**
	 * Where the banner goes. On desktop, above the note, so it stays in view while scrolling. On mobile,
	 * Obsidian's header floats over the top of the note, so the banner goes inside the scrolling text above the
	 * title instead, in both the editor and reading view.
	 */
	private containers(view: MarkdownView): HTMLElement[] {
		if (!Platform.isMobile) return [view.contentEl];
		return [".markdown-source-view .cm-sizer", ".markdown-reading-view .markdown-preview-sizer"]
			.map((selector) => view.contentEl.querySelector<HTMLElement>(selector))
			.filter((el): el is HTMLElement => el !== null);
	}

	private fill(banner: HTMLElement, info: NoteInfo, reminder: Reminder) {
		const { allDayTime } = this.plugin.settings;
		const status = this.plugin.reminderStatus(info);
		banner.empty();
		banner.toggleClass("is-missed", status === "missed");
		banner.toggleClass("is-ended", status === "ended");
		const hex = colorHex(info.color);
		if (hex) banner.style.setProperty("--cr-note-color", hex);
		else banner.style.removeProperty("--cr-note-color");

		const icon = banner.createDiv({ cls: "cr-banner-icon" });
		setIcon(icon, reminder.type === "statusbar" ? "pin" : reminder.type === "allday" ? "calendar" : "alarm-clock");
		const text = banner.createDiv({ cls: "cr-banner-text" });
		let description = describeReminder(reminder, allDayTime, status);
		if (reminder.type === "statusbar" && !Platform.isAndroidApp) description = t.reminder.pinnedOnAndroid;
		text.createDiv({ text: description });
		if (info.subtitle) text.createDiv({ cls: "cr-banner-subtitle", text: info.subtitle });

		const actions = banner.createDiv({ cls: "cr-banner-actions" });
		const edit = actions.createEl("button", { text: t.banner.edit });
		edit.addEventListener("click", () => new ReminderModal(this.plugin, info.file, reminder).open());
		const remove = actions.createEl("button", { text: t.banner.remove });
		remove.addEventListener("click", () => void this.plugin.setReminder(info.file, null));
	}
}
