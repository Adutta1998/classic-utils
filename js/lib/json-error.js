"use strict";

/** Turns a JSON.parse failure into a human readable line/column message. */
export function describeJsonError(error, text) {
    const message = error?.message ?? "Invalid JSON";
    const match = /position (\d+)/i.exec(message);
    if (!match) return message;

    const position = Number(match[1]);
    const before = text.slice(0, position);
    const line = before.split("\n").length;
    const column = position - before.lastIndexOf("\n");
    const cleaned = message.replace(/\s*at position \d+.*$/i, "");
    return `${cleaned} — line ${line}, column ${column}`;
}

/** Parses JSON and throws an Error carrying a friendly message. */
export function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(describeJsonError(error, text));
    }
}

/** Recursively sorts object keys so diffs stay stable. */
export function sortKeysDeep(value) {
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value).sort((a, b) => a.localeCompare(b)).map((key) => [key, sortKeysDeep(value[key])]),
        );
    }
    return value;
}
