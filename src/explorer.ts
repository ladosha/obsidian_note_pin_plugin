import { App, Keymap, Menu, TAbstractFile, TFile, TFolder, View } from "obsidian";
import { colorHex, colorRank } from "./constants";
import { t } from "./i18n";
import { allNotes, noteInfo, type NoteInfo } from "./model";
import type NotePinPlugin from "./main";

const STYLE_ID = "vladmas-note-pin-explorer-colors";
const SECTION_CLASS = "cr-pinned-section";

/** The parts of Obsidian's file explorer view used for sorting by color. They aren't public API. */
interface FileExplorerInternals extends View {
	getSortedFolderItems?: (folder: TFolder, ...rest: unknown[]) => { file?: TAbstractFile }[];
	requestSort?: () => void;
}

/**
 * Decorates Obsidian's file explorer:
 * - note colors, through a stylesheet keyed on each row's data-path attribute, so rows the explorer draws
 *   later are colored too;
 * - a Pinned section above the folders, made of rows that look like the explorer's own;
 * - optionally, sorting by color inside each folder, by wrapping the explorer's internal sort function.
 */
export class ExplorerDecorations {
	private plugin: NotePinPlugin;
	private styleEl: HTMLStyleElement | null = null;
	private observers = new Map<HTMLElement, MutationObserver>();
	private unpatchSort: (() => void) | null = null;
	private colorSignature = "";
	private pinnedSignature = "";

	constructor(plugin: NotePinPlugin) {
		this.plugin = plugin;
	}

	refresh() {
		const notes = allNotes(this.plugin.app);
		const colorsChanged = this.updateColors(notes);
		this.updatePinned(notes);
		this.updateSortPatch(colorsChanged);
	}

	unload() {
		this.styleEl?.remove();
		this.observers.forEach((observer) => observer.disconnect());
		this.observers.clear();
		document.querySelectorAll(`.${SECTION_CLASS}`).forEach((el) => el.remove());
		if (this.unpatchSort) {
			this.unpatchSort();
			this.explorerView()?.requestSort?.();
		}
	}

	/** Returns whether any note's color changed since the last call. */
	private updateColors(notes: NoteInfo[]): boolean {
		const mode = this.plugin.settings.explorerColors;
		const colored = notes.filter((n) => colorHex(n.color)).map((n) => [n.file.path, colorHex(n.color)] as const);
		const signature = mode + JSON.stringify(colored);
		if (signature === this.colorSignature) return false;
		this.colorSignature = signature;
		if (!this.styleEl) this.styleEl = document.head.createEl("style", { attr: { id: STYLE_ID } });
		if (mode === "off") {
			this.styleEl.textContent = "";
			return true;
		}
		this.styleEl.textContent = colored
			.map(([path, hex]) => {
				const row = `.nav-file-title[data-path="${cssString(path)}"]`;
				return mode === "tint"
					? `${row}{box-shadow:inset 3px 0 0 ${hex};}${row}:not(.is-active):not(:hover){background-color:color-mix(in srgb, ${hex} 16%, transparent);}`
					: `${row}{color:${hex};}`;
			})
			.join("\n");
		return true;
	}

	private updatePinned(notes: NoteInfo[], force = false) {
		const { app, settings } = this.plugin;
		const pinned = settings.explorerPinnedSection ? notes.filter((n) => n.pinned) : [];
		pinned.sort((a, b) =>
			settings.sortExplorerByColor
				? colorRank(a.color) - colorRank(b.color) || a.file.basename.localeCompare(b.file.basename)
				: a.file.basename.localeCompare(b.file.basename),
		);
		const active = app.workspace.getActiveFile()?.path ?? "";
		const signature = JSON.stringify([active, pinned.map((n) => n.file.path)]);
		const leaves = app.workspace.getLeavesOfType("file-explorer");
		const missing = leaves.some((leaf) => {
			const container = leaf.view.containerEl.querySelector(".nav-files-container");
			return container && pinned.length > 0 && container.firstElementChild?.classList.contains(SECTION_CLASS) !== true;
		});
		if (!force && !missing && signature === this.pinnedSignature) return;
		this.pinnedSignature = signature;
		for (const leaf of leaves) this.renderPinned(leaf.view.containerEl, pinned, active);
	}

	private renderPinned(explorerEl: HTMLElement, pinned: NoteInfo[], active: string) {
		const container = explorerEl.querySelector<HTMLElement>(".nav-files-container");
		if (!container) return;
		let section = container.querySelector<HTMLElement>(`:scope > .${SECTION_CLASS}`);
		if (pinned.length === 0) {
			section?.remove();
			return;
		}
		if (!section) section = createDiv({ cls: SECTION_CLASS });
		if (container.firstElementChild !== section) container.prepend(section);
		section.empty();
		section.createDiv({ cls: "cr-pinned-header", text: t.explorer.pinned });
		for (const info of pinned) {
			const item = section.createDiv({ cls: "tree-item nav-file" });
			const row = item.createDiv({ cls: "tree-item-self nav-file-title is-clickable", attr: { "data-path": info.file.path } });
			if (info.file.path === active) row.addClass("is-active");
			row.createDiv({ cls: "tree-item-inner nav-file-title-content", text: info.file.basename });
			row.addEventListener("click", (evt) => void this.plugin.openNote(info.file, Keymap.isModEvent(evt)));
			row.addEventListener("contextmenu", (evt) => {
				evt.preventDefault();
				const menu = new Menu();
				this.plugin.app.workspace.trigger("file-menu", menu, info.file, "vladmas-note-pin-pinned");
				menu.showAtMouseEvent(evt);
			});
		}
		this.observe(container);
	}

	/** The explorer sometimes redraws its container; put the section back when that removes it. */
	private observe(container: HTMLElement) {
		if (this.observers.has(container)) return;
		const observer = new MutationObserver(() => {
			if (!container.firstElementChild?.classList.contains(SECTION_CLASS)) {
				this.updatePinned(allNotes(this.plugin.app), true);
			}
		});
		observer.observe(container, { childList: true });
		this.observers.set(container, observer);
	}

	private updateSortPatch(colorsChanged: boolean) {
		const wanted = this.plugin.settings.sortExplorerByColor;
		if (!wanted) {
			if (this.unpatchSort) {
				this.unpatchSort();
				this.unpatchSort = null;
				this.explorerView()?.requestSort?.();
			}
			return;
		}
		if (this.unpatchSort) {
			if (colorsChanged) this.explorerView()?.requestSort?.();
			return;
		}
		const view = this.explorerView();
		// The explorer may not be loaded yet (Obsidian defers hidden views); the next refresh tries again.
		if (!view || typeof view.getSortedFolderItems !== "function") return;
		const proto = Object.getPrototypeOf(view) as FileExplorerInternals;
		const original = proto.getSortedFolderItems;
		if (typeof original !== "function") return;
		const app = this.plugin.app;
		const patched = function (this: unknown, folder: TFolder, ...rest: unknown[]) {
			return sortByColor(app, original.call(this, folder, ...rest));
		};
		proto.getSortedFolderItems = patched;
		this.unpatchSort = () => {
			if (proto.getSortedFolderItems === patched) proto.getSortedFolderItems = original;
		};
		view.requestSort?.();
	}

	private explorerView(): FileExplorerInternals | null {
		const leaf = this.plugin.app.workspace.getLeavesOfType("file-explorer")[0];
		return (leaf?.view as FileExplorerInternals | undefined) ?? null;
	}
}

/** Keeps the explorer's own order, but moves colored notes up in palette order. Folders stay first. */
function sortByColor<T extends { file?: TAbstractFile }>(app: App, items: T[]): T[] {
	const rank = (item: T) => {
		const file = item.file;
		if (!file || file instanceof TFolder) return -1;
		return file instanceof TFile && file.extension === "md" ? colorRank(noteInfo(app, file).color) : colorRank(null);
	};
	return items
		.map((item, index) => ({ item, index, rank: rank(item) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map((entry) => entry.item);
}

function cssString(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
