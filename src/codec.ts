const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 of the text's UTF-8 bytes as 8 hex digits, the same value as java.util.zip.CRC32. */
export function crc32(text: string): string {
	let c = 0xffffffff;
	for (const byte of new TextEncoder().encode(text)) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/** Base64url without padding: safe in a URL query without percent-encoding. */
export function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The reverse of toBase64Url. Throws on text that isn't base64url. */
export function fromBase64Url(data: string): string {
	const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
	return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** Shortens to `limit` characters (code points, so emoji aren't cut in half), ending with an ellipsis. */
export function trimText(text: string, limit: number): string {
	const chars = Array.from(text);
	return chars.length > limit ? chars.slice(0, limit - 1).join("").trimEnd() + "…" : text;
}

/** The note body as plain text for a notification: markdown syntax removed, whitespace collapsed. */
export function notePreview(markdown: string, limit: number): string {
	const text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/%%[\s\S]*?%%/g, " ")
		.replace(/!?\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, target: string, alias: string) => alias || target)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^\s*[-*+]\s+\[.\]\s+/gm, "")
		.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
		.replace(/\*\*|__|~~|==|[*_`]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return trimText(text, limit);
}

export function randomId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");
}
