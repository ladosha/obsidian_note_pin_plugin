import { App, Notice, Platform, PluginSettingTab, Setting } from "obsidian";
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

export class SettingsTab extends PluginSettingTab {
	private plugin: NotePinPlugin;

	constructor(app: App, plugin: NotePinPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl, plugin } = this;
		containerEl.empty();
		const save = async (change: Partial<Settings>) => {
			Object.assign(plugin.settings, change);
			await plugin.saveSettings();
		};

		new Setting(containerEl).setName(t.settings.colorsHeading).setHeading();
		new Setting(containerEl)
			.setName(t.settings.explorerColors)
			.setDesc(t.settings.explorerColorsDesc)
			.addDropdown((d) =>
				d
					.addOptions(t.settings.explorerColorsOptions)
					.setValue(plugin.settings.explorerColors)
					.onChange((value) => save({ explorerColors: value as ExplorerColors })),
			);
		new Setting(containerEl)
			.setName(t.settings.explorerPinned)
			.setDesc(t.settings.explorerPinnedDesc)
			.addToggle((t) => t.setValue(plugin.settings.explorerPinnedSection).onChange((value) => save({ explorerPinnedSection: value })));
		new Setting(containerEl)
			.setName(t.settings.sortByColor)
			.setDesc(t.settings.sortByColorDesc)
			.addToggle((t) => t.setValue(plugin.settings.sortExplorerByColor).onChange((value) => save({ sortExplorerByColor: value })));

		new Setting(containerEl).setName(t.settings.remindersHeading).setHeading();
		new Setting(containerEl)
			.setName(t.settings.allDayTime)
			.setDesc(t.settings.allDayTimeDesc)
			.addText((text) => {
				text.inputEl.type = "time";
				text.setValue(plugin.settings.allDayTime).onChange((value) => {
					if (/^\d{2}:\d{2}$/.test(value)) void save({ allDayTime: value });
				});
			});
		new Setting(containerEl)
			.setName(t.settings.showContent)
			.setDesc(t.settings.showContentDesc)
			.addToggle((t) =>
				t.setValue(plugin.settings.showContentInNotifications).onChange((value) => save({ showContentInNotifications: value })),
			);
		if (Platform.isDesktopApp) {
			new Setting(containerEl)
				.setName(t.settings.desktop)
				.setDesc(t.settings.desktopDesc)
				.addToggle((t) => t.setValue(plugin.desktop.enabled).onChange((value) => plugin.desktop.setEnabled(value)));
		}

		new Setting(containerEl).setName(t.settings.companionHeading).setHeading();
		new Setting(containerEl).setName(t.settings.appName).setDesc(
			createFragment((desc) => {
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
			}),
		);
		if (Platform.isAndroidApp) this.displayCompanion(containerEl, save);

		this.displayAbout(containerEl);
	}

	private displayCompanion(containerEl: HTMLElement, save: (change: Partial<Settings>) => Promise<void>) {
		const { plugin } = this;
		new Setting(containerEl)
			.setName(t.settings.sendAutomatically)
			.setDesc(t.settings.sendAutomaticallyDesc)
			.addToggle((t) => t.setValue(plugin.settings.sendAutomatically).onChange((value) => save({ sendAutomatically: value })));

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
		const connection = new Setting(containerEl)
			.setName(t.settings.connection)
			.setDesc(describe())
			.addButton((b) =>
				b.setButtonText(t.settings.sendNow).setCta().onClick(async () => {
					await plugin.companion.send("manual");
					// The app's reply arrives a moment later; update just this line, so the page doesn't jump.
					window.setTimeout(() => connection.setDesc(describe()), 1500);
				}),
			)
			.addButton((b) =>
				b.setButtonText(t.settings.resetConnection).onClick(() => {
					plugin.companion.resetConnection();
					new Notice(t.settings.connectionReset);
					this.display();
				}),
			);
	}

	private displayAbout(containerEl: HTMLElement) {
		new Setting(containerEl).setName(t.settings.aboutHeading).setHeading();
		const about = containerEl.createDiv({ cls: "cr-about" });
		const credit = about.createEl("p", { cls: "cr-about-credit" });
		const [before, after] = t.settings.madeBy;
		credit.appendText(before);
		credit.createEl("a", { text: DEVELOPER_NAME, href: DEVELOPER_SITE });
		credit.appendText(after);
		const kofi = about.createEl("button", { cls: "cr-kofi", text: t.settings.kofi });
		kofi.addEventListener("click", () => window.open(KOFI_URL));
	}
}
