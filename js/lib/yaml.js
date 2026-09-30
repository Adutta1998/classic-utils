"use strict";

/**
 * Small dependency-free YAML subset parser and serialiser.
 *
 * Supported: block mappings and sequences, flow collections, quoted and plain
 * scalars, comments, block scalars (| and >), multiple indentation levels and
 * the `---` document marker. Not supported: anchors, aliases, tags, complex
 * keys and multiple documents — those raise a descriptive error instead of
 * silently producing wrong data.
 */

const INDICATORS = "-?:,[]{}#&*!|>'\"%@`";

/* ========================================================================== */
/* Parsing                                                                    */
/* ========================================================================== */

export function parse(text) {
    const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
    const lines = [];

    rawLines.forEach((raw, lineNo) => {
        if (/^\s*$/.test(raw)) return;
        if (/^\t/.test(raw)) {
            throw new YamlError("Tabs cannot be used for indentation", lineNo + 1);
        }
        const indent = raw.length - raw.trimStart().length;
        let content = stripComment(raw.trim());
        if (!content) return;
        if (/^---\s*$/.test(content) || /^\.\.\.\s*$/.test(content)) return;
        if (/^[&*]\S/.test(content) || /\s[&*]\S/.test(content)) {
            throw new YamlError("Anchors and aliases are not supported", lineNo + 1);
        }

        // Expand "- item" into a marker line plus an indented body line.
        let currentIndent = indent;
        while (content === "-" || content.startsWith("- ")) {
            lines.push({ indent: currentIndent, content: "-", lineNo });
            if (content === "-") { content = ""; break; }
            content = content.slice(2).trim();
            currentIndent += 2;
        }
        if (content) lines.push({ indent: currentIndent, content, lineNo });
    });

    if (!lines.length) return null;
    const context = { lines, rawLines };
    const { value } = parseBlock(context, 0, lines[0].indent);
    return value;
}

export class YamlError extends Error {
    constructor(message, line) {
        super(line ? `${message} (line ${line})` : message);
        this.name = "YamlError";
        this.line = line;
    }
}

function stripComment(text) {
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
            return text.slice(0, i).trimEnd();
        }
    }
    return text.trimEnd();
}

function regionEnd(lines, start, indent) {
    let end = start;
    while (end < lines.length && lines[end].indent > indent) end += 1;
    return end;
}

function parseBlock(context, index, indent) {
    const line = context.lines[index];
    if (!line) return { value: null, next: index };
    if (line.content === "-") return parseSequence(context, index, indent);
    // A line without a "key:" separator is a bare scalar, typically a sequence item.
    if (!splitKey(line.content)) {
        return { value: parseScalar(line.content, line.lineNo), next: index + 1 };
    }
    return parseMapping(context, index, indent);
}

function parseSequence(context, index, indent) {
    const { lines } = context;
    const items = [];
    let i = index;
    while (i < lines.length && lines[i].indent === indent && lines[i].content === "-") {
        const end = regionEnd(lines, i + 1, indent);
        if (end === i + 1) {
            items.push(null);
        } else {
            items.push(parseBlock(context, i + 1, lines[i + 1].indent).value);
        }
        i = end;
    }
    return { value: items, next: i };
}

function parseMapping(context, index, indent) {
    const { lines } = context;
    const result = {};
    let i = index;
    while (i < lines.length && lines[i].indent === indent && lines[i].content !== "-") {
        const line = lines[i];
        const split = splitKey(line.content);
        if (!split) throw new YamlError(`Expected "key: value" but found "${line.content}"`, line.lineNo + 1);

        const key = parseScalar(split.key, line.lineNo);
        const rest = split.value;
        const end = regionEnd(lines, i + 1, indent);

        if (rest === "") {
            result[key] = end === i + 1 ? null : parseBlock(context, i + 1, lines[i + 1].indent).value;
        } else if (/^[|>][+-]?\d*$/.test(rest)) {
            result[key] = readBlockScalar(context, i, end, rest, indent);
        } else {
            result[key] = parseScalar(rest, line.lineNo);
        }
        i = end;
    }
    return { value: result, next: i };
}

function readBlockScalar(context, keyIndex, end, header, indent) {
    const { lines, rawLines } = context;
    if (end === keyIndex + 1) return "";
    const folded = header[0] === ">";
    const chomp = header.includes("-") ? "strip" : header.includes("+") ? "keep" : "clip";

    const firstRaw = lines[keyIndex + 1].lineNo;
    const lastRaw = lines[end - 1].lineNo;
    const blockIndent = lines[keyIndex + 1].indent;

    const body = rawLines
        .slice(firstRaw, lastRaw + 1)
        .map((raw) => (raw.length > indent ? raw.slice(blockIndent) : raw.trim()));

    let text = folded
        ? body.reduce((acc, current, idx) => {
            if (idx === 0) return current;
            if (current === "" || acc.endsWith("\n")) return `${acc}\n${current}`;
            return `${acc} ${current}`;
        }, "")
        : body.join("\n");

    if (chomp === "strip") text = text.replace(/\n+$/, "");
    else if (chomp === "clip") text = `${text.replace(/\n+$/, "")}\n`;
    return text;
}

/** Finds the `key:` separator outside quotes and flow collections. */
function splitKey(text) {
    let quote = null;
    let depth = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quote) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === "[" || char === "{") depth += 1;
        else if (char === "]" || char === "}") depth -= 1;
        else if (char === ":" && depth === 0) {
            const next = text[i + 1];
            if (next === undefined || next === " ") {
                return { key: text.slice(0, i).trim(), value: text.slice(i + 1).trim() };
            }
        }
    }
    return null;
}

function parseScalar(token, lineNo) {
    const text = token.trim();
    if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
    if (text[0] === '"' || text[0] === "'") return unquote(text, lineNo);
    if (text[0] === "[" || text[0] === "{") return parseFlow(text, lineNo);
    if (text === "true" || text === "True" || text === "TRUE") return true;
    if (text === "false" || text === "False" || text === "FALSE") return false;
    if (/^[-+]?\d+$/.test(text)) return Number(text);
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(text)) return Number(text);
    if (/^0x[0-9a-fA-F]+$/.test(text)) return Number.parseInt(text, 16);
    return text;
}

function unquote(text, lineNo) {
    const quote = text[0];
    if (text.length < 2 || text[text.length - 1] !== quote) {
        throw new YamlError("Unterminated quoted string", lineNo + 1);
    }
    const inner = text.slice(1, -1);
    if (quote === "'") return inner.replace(/''/g, "'");
    try {
        return JSON.parse(`"${inner.replace(/\n/g, "\\n")}"`);
    } catch {
        return inner;
    }
}

function parseFlow(text, lineNo) {
    const state = { text, pos: 0, lineNo };
    const value = readFlowValue(state);
    skipSpace(state);
    if (state.pos < state.text.length) {
        throw new YamlError(`Unexpected "${state.text.slice(state.pos)}" in flow collection`, lineNo + 1);
    }
    return value;
}

const skipSpace = (state) => { while (/\s/.test(state.text[state.pos] ?? "")) state.pos += 1; };

function readFlowValue(state) {
    skipSpace(state);
    const char = state.text[state.pos];
    if (char === "[") return readFlowSeq(state);
    if (char === "{") return readFlowMap(state);
    return parseScalar(readFlowScalar(state), state.lineNo);
}

function readFlowSeq(state) {
    state.pos += 1;
    const items = [];
    skipSpace(state);
    if (state.text[state.pos] === "]") { state.pos += 1; return items; }
    for (;;) {
        items.push(readFlowValue(state));
        skipSpace(state);
        const char = state.text[state.pos];
        state.pos += 1;
        if (char === "]") return items;
        if (char !== ",") throw new YamlError("Expected , or ] in flow sequence", state.lineNo + 1);
    }
}

function readFlowMap(state) {
    state.pos += 1;
    const map = {};
    skipSpace(state);
    if (state.text[state.pos] === "}") { state.pos += 1; return map; }
    for (;;) {
        skipSpace(state);
        const key = parseScalar(readFlowScalar(state, true), state.lineNo);
        skipSpace(state);
        if (state.text[state.pos] !== ":") throw new YamlError("Expected : in flow mapping", state.lineNo + 1);
        state.pos += 1;
        map[key] = readFlowValue(state);
        skipSpace(state);
        const char = state.text[state.pos];
        state.pos += 1;
        if (char === "}") return map;
        if (char !== ",") throw new YamlError("Expected , or } in flow mapping", state.lineNo + 1);
    }
}

function readFlowScalar(state, isKey = false) {
    skipSpace(state);
    const char = state.text[state.pos];
    if (char === '"' || char === "'") {
        const start = state.pos;
        state.pos += 1;
        while (state.pos < state.text.length && state.text[state.pos] !== char) {
            if (state.text[state.pos] === "\\") state.pos += 1;
            state.pos += 1;
        }
        state.pos += 1;
        return state.text.slice(start, state.pos);
    }
    const stop = isKey ? /[:,}\]]/ : /[,}\]]/;
    const start = state.pos;
    while (state.pos < state.text.length && !stop.test(state.text[state.pos])) state.pos += 1;
    return state.text.slice(start, state.pos).trim();
}

/* ========================================================================== */
/* Serialising                                                                */
/* ========================================================================== */

export function stringify(value, { indent = 2 } = {}) {
    const text = dump(value, indent);
    return text.endsWith("\n") ? text : `${text}\n`;
}

/** Renders `value` with its first line unindented; nested lines are relative. */
function dump(value, step) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean" || typeof value === "number") return String(value);
    if (typeof value === "string") return dumpString(value, step);

    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return value.map((item) => prefixBlock(dump(item, step), "- ", "  ")).join("\n");
    }

    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return "{}";
    return entries
        .map(([key, item]) => {
            const safeKey = dumpKey(key);
            if (isCollection(item) && !isEmptyCollection(item)) {
                return `${safeKey}:\n${indentBlock(dump(item, step), " ".repeat(step))}`;
            }
            return `${safeKey}: ${dump(item, step)}`;
        })
        .join("\n");
}

const indentBlock = (text, pad) => text.split("\n").map((line) => (line ? pad + line : line)).join("\n");

const prefixBlock = (text, firstPad, restPad) =>
    text.split("\n").map((line, index) => (index === 0 ? firstPad + line : restPad + line)).join("\n");

const isCollection = (value) => value !== null && typeof value === "object";
const isEmptyCollection = (value) =>
    Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;

function dumpString(text, step) {
    if (text.includes("\n")) {
        // "|" keeps a single trailing newline, "|-" strips it.
        const header = /[^\n]\n$/.test(text) ? "|" : "|-";
        const body = text.replace(/\n+$/, "").split("\n").map((line) => " ".repeat(step) + line).join("\n");
        return `${header}\n${body}`;
    }
    return needsQuotes(text) ? JSON.stringify(text) : text;
}

function dumpKey(key) {
    const text = String(key);
    return needsQuotes(text) || text.includes(":") ? JSON.stringify(text) : text;
}

function needsQuotes(text) {
    if (text === "") return true;
    if (text !== text.trim()) return true;
    if (INDICATORS.includes(text[0])) return true;
    if (/[:#]\s/.test(text) || text.endsWith(":")) return true;
    if (/^(true|false|null|True|False|Null|TRUE|FALSE|NULL|~|yes|no|on|off|Yes|No|On|Off)$/.test(text)) return true;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return true;
    if (/^\d+(:\d+)+$/.test(text)) return true; // sexagesimal-looking values such as port mappings
    return false;
}
