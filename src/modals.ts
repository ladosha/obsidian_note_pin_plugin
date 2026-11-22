import { App, DropdownComponent, Modal, Setting, TFile } from "obsidian";
import { PALETTE, colorHex } from "./constants";
import { capitalize, t } from "./i18n";
import { lunarOf } from "./lunar";
import { repeatLabel, type Reminder, type ReminderType } from "./model";
import { formatDate, formatWallTime, parseWallTime, wallTimeOf, weekdayInMonth, type Repeat } from "./recurrence";
import type NotePinPlugin from "./main";

export class ColorModal extends Modal {
	private current: string | null;
	private onChoose: (color: string | null) => void;

	constructor(app: App, current: string | null, onChoose: (color: string | null) => void) {
		super(app);
		this.current = current;
		this.onChoose = onChoose;
	}

	onOpen() {
		this.titleEl.setText(t.colorModal.title);
		const grid = this.contentEl.createDiv({ cls: "cr-swatches" });
		const choices: { name: string | null; label: string }[] = [
			{ name: null, label: t.colorModal.none },
			...PALETTE.map((c) => ({ name: c.name, label: t.colors[c.name] })),
		];
		for (const choice of choices) {
			const button = grid.createEl("button", { cls: "cr-swatch" });
			if (choice.name === this.current) button.addClass("is-selected");
			const dot = button.createDiv({ cls: "cr-swatch-dot" });
			const hex = colorHex(choice.name);
			if (hex) dot.style.setProperty("--cr-note-color", hex);
			else dot.addClass("is-none");
			button.createDiv({ cls: "cr-swatch-label", text: choice.label });
			button.addEventListener("click", () => {
				this.onChoose(choice.name);
				this.close();
			});
		}
		// Start keyboard focus on the current color, not on None, which would look selected.
		grid.querySelector<HTMLElement>(".is-selected")?.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class ReminderModal extends Modal {
	private plugin: NotePinPlugin;
	private file: TFile;
	private current: Reminder | null;
	private type: ReminderType;
	private date: string;
	private time: string;
	private repeat: Repeat;
	/** The last day a repeat fires on, "YYYY-MM-DD", or "" to repeat forever. */
	private until: string;
	private repeatDropdown?: DropdownComponent;
	/** Text selected in the note, which the notification shows once the reminder is saved. */
	private subtitle?: string;

	constructor(plugin: NotePinPlugin, file: TFile, current: Reminder | null, subtitle?: string) {
		super(plugin.app);
		this.plugin = plugin;
		this.file = file;
		this.current = current;
		this.subtitle = subtitle;
		const inAnHour = wallTimeOf(new Date(Date.now() + 60 * 60_000));
		inAnHour.minute = 0;
		const start = (current?.at && parseWallTime(current.at, plugin.settings.allDayTime)) || inAnHour;
		this.type = current?.type ?? "time";
		this.date = formatDate(start);
		this.time = formatWallTime(start).slice(11);
		this.repeat = current?.repeat ?? "none";
		this.until = current?.until ?? "";
	}

	onOpen() {
		this.titleEl.setText(this.current ? t.reminderModal.editTitle : t.reminderModal.setTitle);
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { cls: "cr-modal-note", text: this.file.basename });
		if (this.subtitle) contentEl.createEl("p", { cls: "cr-modal-subtitle", text: t.reminderModal.notificationText(this.subtitle) });

		new Setting(contentEl).setName(t.reminderModal.type).addDropdown((d) =>
			d
				.addOptions(t.reminderModal.types)
				.setValue(this.type)
				.onChange((value) => {
					this.type = value as ReminderType;
					this.render();
				}),
		);
		if (this.type === "statusbar") {
			contentEl.createEl("p", {
				cls: "setting-item-description",
				text: t.reminderModal.statusbarHelp,
			});
		} else {
			new Setting(contentEl).setName(t.reminderModal.date).addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.date).onChange((value) => {
					this.date = value;
					// "Every month on the third Sunday" and the lunar date depend on the date.
					this.updateRepeatOptions();
				});
			});
			if (this.type === "time") {
				new Setting(contentEl).setName(t.reminderModal.time).addText((text) => {
					text.inputEl.type = "time";
					text.setValue(this.time).onChange((value) => (this.time = value));
				});
			} else {
				contentEl.createEl("p", {
					cls: "setting-item-description",
					text: t.reminderModal.allDayHelp(this.plugin.settings.allDayTime),
				});
			}
			new Setting(contentEl).setName(t.reminderModal.repeat).addDropdown((d) => {
				this.repeatDropdown = d;
				this.updateRepeatOptions();
				d.onChange((value) => {
					this.repeat = value as Repeat;
					until.settingEl.toggle(this.repeat !== "none");
				});
			});
			const until = new Setting(contentEl)
				.setName(t.reminderModal.until)
				.setDesc(t.reminderModal.untilDesc)
				.addText((text) => {
					text.inputEl.type = "date";
					text.setValue(this.until).onChange((value) => (this.until = value));
				});
			until.settingEl.toggle(this.repeat !== "none");
		}

		const buttons = new Setting(contentEl);
		if (this.current) {
			buttons.addButton((b) =>
				b
					.setButtonText(t.reminderModal.remove)
					.setWarning()
					.onClick(async () => {
						await this.plugin.setReminder(this.file, null);
						this.close();
					}),
			);
		}
		buttons.addButton((b) => b.setButtonText(t.reminderModal.cancel).onClick(() => this.close()));
		buttons.addButton((b) =>
			b
				.setButtonText(t.reminderModal.save)
				.setCta()
				.onClick(async () => {
					const reminder = this.reminder();
					if (!reminder) return;
					await this.plugin.setReminder(this.file, reminder, this.subtitle);
					this.close();
				}),
		);
	}

	/**
	 * Fills the repeat menu for the current date, each choice naming its day: "Every week on Sunday", "Every month on
	 * the 15th". The weekday choices appear when they make sense: "on the fourth Sunday" up to the fourth, "on the last
	 * Sunday" in the month's last seven days. A choice the new date no longer offers moves to the nearest one.
	 */
	private updateRepeatOptions() {
		const dropdown = this.repeatDropdown;
		if (!dropdown) return;
		const start = parseWallTime(this.date);
		const { repeats } = t.reminderModal;
		// Without a valid date, the plain names.
		const label = (repeat: "daily" | "weekly" | "biweekly" | "monthly" | "yearly") =>
			start ? capitalize(repeatLabel(repeat, start)) : repeats[repeat];
		const options: Partial<Record<Repeat, string>> = {
			none: repeats.none,
			daily: label("daily"),
			weekly: label("weekly"),
			biweekly: label("biweekly"),
			monthly: label("monthly"),
		};
		if (start) {
			const { nth, last } = weekdayInMonth(start);
			if (nth <= 4) options["monthly-weekday"] = capitalize(repeatLabel("monthly-weekday", start));
			if (last) options["monthly-last-weekday"] = capitalize(repeatLabel("monthly-last-weekday", start));
		}
		options.yearly = label("yearly");
		if (start && lunarOf(start)) options["yearly-lunar"] = capitalize(repeatLabel("yearly-lunar", start));

		if (!options[this.repeat]) {
			const nearest: Partial<Record<Repeat, Repeat>> = {
				"monthly-weekday": "monthly-last-weekday",
				"monthly-last-weekday": "monthly-weekday",
			};
			const fallback = nearest[this.repeat];
			this.repeat = fallback && options[fallback] ? fallback : this.repeat === "yearly-lunar" ? "yearly" : "monthly";
		}
		dropdown.selectEl.empty();
		dropdown.addOptions(options).setValue(this.repeat);
	}

	private reminder(): Reminder | null {
		if (this.type === "statusbar") return { type: "statusbar", at: null, repeat: "none" };
		const at = this.type === "time" ? `${this.date}T${this.time}` : this.date;
		if (!parseWallTime(at)) return this.showError(t.reminderModal.invalidDate);
		const reminder: Reminder = { type: this.type, at, repeat: this.repeat };
		if (this.repeat !== "none" && this.until) {
			if (!parseWallTime(this.until) || this.until < this.date) return this.showError(t.reminderModal.invalidUntil);
			reminder.until = this.until;
		}
		return reminder;
	}

	private showError(text: string): null {
		this.contentEl.querySelector(".cr-modal-error")?.remove();
		this.contentEl.createEl("p", { cls: "cr-modal-error", text });
		return null;
	}
}
