import {
	App,
	Notice,
	Platform,
	PluginSettingTab,
	Setting,
	type SettingDefinitionControl,
	type SettingDefinitionEmpty,
	type SettingDefinitionItem,
} from "obsidian";
import { describeProblem } from "./companion";
import { DEVELOPER_NAME, DEVELOPER_SITE, FDROID_URL, GITHUB_RELEASES_URL, KOFI_URL, PLAY_STORE_URL } from "./constants";
import { t } from "./i18n";
import { formatDate } from "./model";
import type NotePinPlugin from "./main";

export type ExplorerColors = "tint" | "text" | "off";
export type ListSort = "modified" | "title" | "color" | "reminder";
export type ListFilter = "all" | "colored" | "reminders" | "pinned";

export interface Settings {
	explorerColors: ExplorerColors;
	explorerPinnedSection: boolean;
	sortExplorerByColor: boolean;
	allDayTime: string;
	showContentInNotifications: boolean;
	sendAutomatically: boolean;
	listSort: ListSort;
	listFilter: ListFilter;
}

export const DEFAULT_SETTINGS: Settings = {
	explorerColors: "tint",
	explorerPinnedSection: true,
	sortExplorerByColor: false,
	allDayTime: "09:00",
	showContentInNotifications: true,
	sendAutomatically: true,
	listSort: "modified",
	listFilter: "all",
};

/** The keys the declarative controls read and write: the settings, plus this computer's desktop toggle. */
type ControlKey = keyof Settings | "desktopEnabled";

/** A row the tab draws itself. Narrower than Obsidian's render definition, so display() can draw it too. */
interface RenderedItem {
	name: string;
	desc?: string | DocumentFragment;
	visible?: boolean;
	searchable?: boolean;
	render: (setting: Setting) => void;
}

type Item = SettingDefinitionControl<ControlKey> | SettingDefinitionEmpty | RenderedItem;

interface Group {
	type: "group";
	heading: string;
	items: Item[];
}

export class SettingsTab extends PluginSettingTab {
	private plugin: NotePinPlugin;

	constructor(app: App, plugin: NotePinPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Obsidian 1.13 and later draw the tab from these, and include them in settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.groups();
	}

	getControlValue(key: string): unknown {
		if (key === "desktopEnabled") return this.plugin.desktop.enabled;
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "desktopEnabled") {
			this.plugin.desktop.setEnabled(value === true);
			return;
		}
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
	}

	/** Draws the same groups on Obsidian before 1.13, which doesn't call getSettingDefinitions(). */
	display() {
		const { containerEl } = this;
		containerEl.empty();
		for (const group of this.groups()) {
			new Setting(containerEl).setName(group.heading).setHeading();
			for (const item of group.items) {
				if (item.visible === false) continue;
				const setting = new Setting(containerEl).setName(item.name);
				if (item.desc) setting.setDesc(item.desc);
				if (item.render) {
					item.render(setting);
					continue;
				}
				const control = item.control;
				if (control?.type === "toggle") {
					setting.addToggle((toggle) =>
						toggle
							.setValue(this.getControlValue(control.key) === true)
							.onChange((value) => this.setControlValue(control.key, value)),
					);
				} else if (control?.type === "dropdown") {
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions(control.options)
							.setValue(String(this.getControlValue(control.key)))
							.onChange((value) => this.setControlValue(control.key, value)),
					);
				}
			}
		}
	}

	private groups(): Group[] {
		return [
			{
				type: "group",
				heading: t.settings.colorsHeading,
				items: [
					{
						name: t.settings.explorerColors,
						desc: t.settings.explorerColorsDesc,
						control: {
							type: "dropdown",
							key: "explorerColors",
							options: t.settings.explorerColorsOptions,
							defaultValue: DEFAULT_SETTINGS.explorerColors,
						},
					},
					{
						name: t.settings.explorerPinned,
						desc: t.settings.explorerPinnedDesc,
						control: { type: "toggle", key: "explorerPinnedSection", defaultValue: DEFAULT_SETTINGS.explorerPinnedSection },
					},
					{
						name: t.settings.sortByColor,
						desc: t.settings.sortByColorDesc,
						control: { type: "toggle", key: "sortExplorerByColor", defaultValue: DEFAULT_SETTINGS.sortExplorerByColor },
					},
				],
			},
			{
				type: "group",
				heading: t.settings.remindersHeading,
				items: [
					{
						name: t.settings.allDayTime,
						desc: t.settings.allDayTimeDesc,
						render: (setting) => this.renderAllDayTime(setting),
					},
					{
						name: t.settings.showContent,
						desc: t.settings.showContentDesc,
						control: {
							type: "toggle",
							key: "showContentInNotifications",
							defaultValue: DEFAULT_SETTINGS.showContentInNotifications,
						},
					},
					{
						name: t.settings.desktop,
						desc: t.settings.desktopDesc,
						visible: Platform.isDesktopApp,
						control: { type: "toggle", key: "desktopEnabled" },
					},
				],
			},
			{
				type: "group",
				heading: t.settings.companionHeading,
				items: [
					{ name: t.settings.appName, desc: this.appDesc() },
					{
						name: t.settings.sendAutomatically,
						desc: t.settings.sendAutomaticallyDesc,
						visible: Platform.isAndroidApp,
						control: { type: "toggle", key: "sendAutomatically", defaultValue: DEFAULT_SETTINGS.sendAutomatically },
					},
					{
						name: t.settings.connection,
						visible: Platform.isAndroidApp,
						render: (setting) => this.renderConnection(setting),
					},
				],
			},
			{
				type: "group",
				heading: t.settings.aboutHeading,
				items: [
					{
						name: t.settings.madeBy.join(DEVELOPER_NAME),
						searchable: false,
						render: (setting) => this.renderAbout(setting),
					},
				],
			},
		];
	}

	/** A text control can't be a time picker, so this row is drawn by hand. */
	private renderAllDayTime(setting: Setting) {
		const { plugin } = this;
		setting.addText((text) => {
			text.inputEl.type = "time";
			text.setValue(plugin.settings.allDayTime).onChange(async (value) => {
				if (!/^\d{2}:\d{2}$/.test(value)) return;
				plugin.settings.allDayTime = value;
				await plugin.saveSettings();
			});
		});
	}

	private appDesc(): DocumentFragment {
		return createFragment((desc) => {
			desc.appendText(Platform.isAndroidApp ? t.settings.appDescAndroid : t.settings.appDescDesktop);
			desc.createEl("br");
			const links = desc.createDiv({ cls: "cr-app-links", text: t.settings.getTheApp });
			const sources: [string, string][] = [
				["Google Play", PLAY_STORE_URL],
				["F-Droid", FDROID_URL],
				["GitHub", GITHUB_RELEASES_URL],
			];
			sources.forEach(([name, href], i) => {
				if (i > 0) links.createSpan({ cls: "cr-app-links-sep", text: " · " });
				links.createEl("a", { text: name, href });
			});
		});
	}

	private renderConnection(setting: Setting) {
		const { plugin } = this;
		const describe = () => {
			const status = plugin.companion.status();
			const lines: string[] = [];
			if (status.confirmedAt) lines.push(t.settings.confirmed(formatDate(new Date(status.confirmedAt), true)));
			else lines.push(t.settings.notConfirmed);
			if (status.problem && (!status.confirmedAt || (status.problemAt ?? 0) > status.confirmedAt)) {
				lines.push(t.settings.lastProblem(describeProblem(status.problem, status.problemDetail)));
			}
			return lines.join(" ");
		};
		setting
			.setDesc(describe())
			.addButton((b) =>
				b
					.setButtonText(t.settings.sendNow)
					.setCta()
					.onClick(async () => {
						await plugin.companion.send("manual");
						// The app's reply arrives a moment later; update just this line, so the page doesn't jump.
						window.setTimeout(() => setting.setDesc(describe()), 1500);
					}),
			)
			.addButton((b) =>
				b.setButtonText(t.settings.resetConnection).onClick(() => {
					plugin.companion.resetConnection();
					new Notice(t.settings.connectionReset);
					setting.setDesc(describe());
				}),
			);
	}

	private renderAbout(setting: Setting) {
		const [before, after] = t.settings.madeBy;
		setting.setName(
			createFragment((name) => {
				name.appendText(before);
				name.createEl("a", { text: DEVELOPER_NAME, href: DEVELOPER_SITE });
				name.appendText(after);
			}),
		);
		const kofi = setting.controlEl.createEl("button", { cls: "cr-kofi", text: t.settings.kofi });
		kofi.addEventListener("click", () => window.open(KOFI_URL));
	}
}
