/** Obsidian handles obsidian://vladmas-note-pin?op=… from the companion app. */
export const PLUGIN_ACTION = "vladmas-note-pin";
/** The companion app receives vladmas-note-pin://sync?… links. */
export const APP_SCHEME = "vladmas-note-pin";

export const DEVELOPER_NAME = "vladmas";
export const DEVELOPER_SITE = "https://vladmas.com";
/** The Ko-fi page, for support. */
export const KOFI_URL = "https://ko-fi.com/vladmas";
/** Where to get the companion app. Each page opens once the app is published there. */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.vladmas.notepinobsidian";
export const FDROID_URL = "https://f-droid.org/packages/com.vladmas.notepinobsidian/";
/** TODO: a placeholder until the app's GitHub repository exists. */
export const GITHUB_RELEASES_URL = "https://github.com/ladosha/obsidian_note_pin_android/releases/latest";

/** Frontmatter properties the plugin reads and writes. */
export const KEYS = {
	id: "vmnp-id",
	color: "color",
	pinned: "pinned",
	reminder: "reminder",
	type: "reminder-type",
	repeat: "reminder-repeat",
	/** The last day a repeating reminder fires on, "YYYY-MM-DD". */
	until: "reminder-until",
	/** Set to the reminder's own value once a device has shown a one-off reminder on time. */
	shown: "reminder-shown",
	subtitle: "notification-subtitle",
} as const;

export type ColorName = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray" | "black" | "white";

/** A palette color; its label in each language is in i18n.ts. */
export interface PaletteColor {
	name: ColorName;
	hex: string;
}

/** The note colors. The companion app has the same values (NoteColors in Model.kt). */
export const PALETTE: readonly PaletteColor[] = [
	{ name: "red", hex: "#e5484d" },
	{ name: "orange", hex: "#f2832b" },
	{ name: "yellow", hex: "#f2c94c" },
	{ name: "green", hex: "#4caf6e" },
	{ name: "blue", hex: "#3d8ef0" },
	{ name: "purple", hex: "#9b6cf0" },
	{ name: "gray", hex: "#8e8e93" },
	{ name: "black", hex: "#3a3a3c" },
	{ name: "white", hex: "#e8e8e8" },
];

/** A palette name, or any #rgb / #rrggbb value, as a CSS color. */
export function colorHex(color: string | null): string | null {
	if (!color) return null;
	const value = color.trim().toLowerCase();
	const named = PALETTE.find((c) => c.name === value || (value === "grey" && c.name === "gray"));
	if (named) return named.hex;
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value) ? value : null;
}

/** Sort position for "sort by color": palette order, then custom colors, then notes without a color. */
export function colorRank(color: string | null): number {
	if (!color) return PALETTE.length + 1;
	const index = PALETTE.findIndex((c) => c.name === color.trim().toLowerCase());
	return index === -1 ? PALETTE.length : index;
}
