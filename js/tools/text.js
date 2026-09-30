"use strict";

import {
    el, panel, textarea, input, field, checkbox, select, copyButton, countMeta,
    codeOutput, keyValueList, statusBox, button, createIO,
} from "../ui.js";
import { splitWords, titleCaseWord, toLines, formatNumber } from "../utils.js";

/* ========================================================================== */
/* Case converter                                                             */
/* ========================================================================== */

const CASES = {
    "camelCase": (words) => words.map((w, i) => (i === 0 ? w.toLowerCase() : titleCaseWord(w))).join(""),
    "PascalCase": (words) => words.map(titleCaseWord).join(""),
    "snake_case": (words) => words.map((w) => w.toLowerCase()).join("_"),
    "kebab-case": (words) => words.map((w) => w.toLowerCase()).join("-"),
    "CONSTANT_CASE": (words) => words.map((w) => w.toUpperCase()).join("_"),
    "dot.case": (words) => words.map((w) => w.toLowerCase()).join("."),
    "path/case": (words) => words.map((w) => w.toLowerCase()).join("/"),
    "Title Case": (words) => words.map(titleCaseWord).join(" "),
    "Sentence case": (words) => {
        const text = words.map((w) => w.toLowerCase()).join(" ");
        return text.charAt(0).toUpperCase() + text.slice(1);
    },
    "lower case": (words) => words.map((w) => w.toLowerCase()).join(" "),
    "UPPER CASE": (words) => words.map((w) => w.toUpperCase()).join(" "),
};

export function caseConverter(host) {
    const source = textarea({ placeholder: "user profile settings", size: "sm", "aria-label": "Text to convert" });
    const results = el("div", { class: "tool-body" });
    let perLine = false;

    function convertOne(text, transform) {
        const words = splitWords(text);
        return words.length ? transform(words) : "";
    }

    function render() {
        results.replaceChildren();
        const raw = source.value.trim();
        if (!raw) {
            results.append(el("p", { class: "small muted", text: "Type some text to see every casing variant." }));
            return;
        }
        for (const [name, transform] of Object.entries(CASES)) {
            const value = perLine
                ? toLines(raw).map((line) => convertOne(line, transform)).join("\n")
                : convertOne(raw, transform);
            results.append(panel(
                { title: name, actions: [copyButton(() => value, { small: true })] },
                el("p", { class: "mono small wrap-anywhere", text: value || "—" }),
            ));
        }
    }

    source.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Input", meta: countMeta(source) },
            source,
            checkbox("Convert each line separately", {
                onChange: (checked) => { perLine = checked; render(); },
            }),
        ),
        results,
    ));
    render();
    source.focus();
}

/* ========================================================================== */
/* Line processor                                                             */
/* ========================================================================== */

export function lineProcessor(host) {
    const filterInput = input({ placeholder: "Optional: keep lines containing…" });
    let caseSensitive = false;
    let invertFilter = false;

    const io = createIO({
        inputLabel: "Lines",
        inputPlaceholder: "banana\napple\ncherry\napple",
        outputLabel: "Result",
        outputPlaceholder: "Processed lines appear here",
        downloadName: "lines.txt",
        actions: [
            { label: "Sort A→Z", glyph: "↓", primary: true, onClick: () => apply("asc") },
            { label: "Sort Z→A", glyph: "↑", onClick: () => apply("desc") },
            { label: "Remove duplicates", glyph: "≠", onClick: () => apply("dedupe") },
            { label: "Remove empty", glyph: "␡", onClick: () => apply("empty") },
            { label: "Trim", glyph: "⇤", onClick: () => apply("trim") },
            { label: "Reverse", glyph: "⇅", onClick: () => apply("reverse") },
            { label: "Number", glyph: "1.", onClick: () => apply("number") },
            { label: "Shuffle", glyph: "⤨", onClick: () => apply("shuffle") },
        ],
        onRun: () => apply("asc"),
    });

    function applyFilter(lines) {
        const needle = filterInput.value;
        if (!needle) return lines;
        return lines.filter((line) => {
            const hit = caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle.toLowerCase());
            return invertFilter ? !hit : hit;
        });
    }

    function apply(operation) {
        let lines = toLines(io.input.value);
        if (!lines.length) {
            io.status.warn("Nothing to process", "Paste some lines first.");
            io.setOutput("");
            return;
        }
        lines = applyFilter(lines);

        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: caseSensitive ? "variant" : "base" });
        switch (operation) {
            case "asc": lines.sort(collator.compare); break;
            case "desc": lines.sort((a, b) => collator.compare(b, a)); break;
            case "dedupe": {
                const seen = new Set();
                lines = lines.filter((line) => {
                    const key = caseSensitive ? line : line.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                break;
            }
            case "empty": lines = lines.filter((line) => line.trim() !== ""); break;
            case "trim": lines = lines.map((line) => line.trim()); break;
            case "reverse": lines.reverse(); break;
            case "number": {
                const width = String(lines.length).length;
                lines = lines.map((line, index) => `${String(index + 1).padStart(width, " ")}. ${line}`);
                break;
            }
            case "shuffle": {
                for (let i = lines.length - 1; i > 0; i -= 1) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [lines[i], lines[j]] = [lines[j], lines[i]];
                }
                break;
            }
            default: break;
        }

        io.setOutput(lines.join("\n"));
        io.status.success(`${formatNumber(lines.length)} lines out of ${formatNumber(toLines(io.input.value).length)}`);
    }

    const options = panel(
        { title: "Filter and options" },
        el(
            "div",
            { class: "inline-row" },
            field("Keep lines containing", filterInput),
            checkbox("Case sensitive", { onChange: (checked) => { caseSensitive = checked; } }),
            checkbox("Invert filter", { onChange: (checked) => { invertFilter = checked; } }),
        ),
        el("p", {
            class: "small muted",
            text: "Operations always run on the original input, so you can try them one after another.",
        }),
        el("div", { class: "btn-row" }, button("Use result as new input", {
            glyph: "↻",
            small: true,
            onClick: () => {
                io.input.value = io.output.getValue();
                io.input.dispatchEvent(new Event("input"));
            },
        })),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}

/* ========================================================================== */
/* Whitespace cleaner                                                         */
/* ========================================================================== */

export function whitespaceCleaner(host) {
    const options = {
        trimLines: true,
        collapseSpaces: true,
        removeBlank: false,
        collapseBlank: true,
        tabsToSpaces: false,
        removeZeroWidth: true,
    };
    const tabWidth = input({ type: "number", value: "4", min: "1", max: "8" });

    const io = createIO({
        inputLabel: "Text",
        inputPlaceholder: "Paste text with messy whitespace…",
        outputLabel: "Cleaned",
        outputPlaceholder: "Cleaned text appears here",
        downloadName: "cleaned.txt",
        actions: [{ label: "Clean", glyph: "✦", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        let text = io.input.value.replace(/\r\n?/g, "\n");
        io.status.reset();
        if (!text) {
            io.setOutput("");
            return;
        }
        if (options.removeZeroWidth) text = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, (m) => (m === "\u00A0" ? " " : ""));
        if (options.tabsToSpaces) text = text.replace(/\t/g, " ".repeat(Number(tabWidth.value) || 4));
        let lines = text.split("\n");
        if (options.trimLines) lines = lines.map((line) => line.replace(/[ \t]+$/g, "").replace(/^[ \t]+/, ""));
        if (options.collapseSpaces) lines = lines.map((line) => line.replace(/[ \t]{2,}/g, " "));
        if (options.removeBlank) lines = lines.filter((line) => line.trim() !== "");
        text = lines.join("\n");
        if (options.collapseBlank) text = text.replace(/\n{3,}/g, "\n\n");
        io.setOutput(text);
        io.status.success(`${formatNumber(io.input.value.length - text.length)} characters removed`);
    }

    const toggle = (label, key) => checkbox(label, {
        checked: options[key],
        onChange: (checked) => { options[key] = checked; run(); },
    });

    const settings = panel(
        { title: "Cleaning rules" },
        el(
            "div",
            { class: "check-grid" },
            toggle("Trim each line", "trimLines"),
            toggle("Collapse repeated spaces", "collapseSpaces"),
            toggle("Remove blank lines", "removeBlank"),
            toggle("Collapse 3+ blank lines", "collapseBlank"),
            toggle("Tabs → spaces", "tabsToSpaces"),
            toggle("Strip zero-width chars", "removeZeroWidth"),
        ),
        el("div", { class: "inline-row" }, field("Tab width", tabWidth)),
        el("p", { class: "small muted", text: "Line endings are always normalised to LF." }),
    );

    tabWidth.addEventListener("input", run);
    host.append(el("div", { class: "tool-body" }, settings, io.node));
    io.input.focus();
}

/* ========================================================================== */
/* Text counter                                                               */
/* ========================================================================== */

export function textCounter(host) {
    const source = textarea({ placeholder: "Paste text to analyse…", size: "lg", "aria-label": "Text to analyse" });
    const statsHost = el("div", {});
    const freqHost = el("div", {});

    function render() {
        const text = source.value;
        const words = text.trim() ? text.trim().split(/\s+/) : [];
        const sentences = text.trim() ? text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()) : [];
        const paragraphs = text.trim() ? text.split(/\n{2,}/).filter((p) => p.trim()) : [];
        const readingMinutes = words.length / 200;

        statsHost.replaceChildren(keyValueList([
            ["Characters", formatNumber(text.length)],
            ["Characters (no spaces)", formatNumber(text.replace(/\s/g, "").length)],
            ["Words", formatNumber(words.length)],
            ["Unique words", formatNumber(new Set(words.map((w) => w.toLowerCase())).size)],
            ["Lines", formatNumber(toLines(text).length)],
            ["Sentences", formatNumber(sentences.length)],
            ["Paragraphs", formatNumber(paragraphs.length)],
            ["Reading time", readingMinutes < 1 ? "< 1 min" : `${Math.round(readingMinutes)} min`],
        ]));

        const counts = new Map();
        for (const word of words) {
            const key = word.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
            if (key.length < 3) continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        freqHost.replaceChildren();
        freqHost.append(top.length
            ? keyValueList(top.map(([word, count]) => [word, formatNumber(count)]))
            : el("p", { class: "small muted", text: "Word frequency appears once there is enough text." }));
    }

    source.addEventListener("input", render);
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Text", meta: countMeta(source) }, source),
        el(
            "div",
            { class: "io-grid" },
            panel({ title: "Statistics" }, statsHost),
            panel({ title: "Top words" }, freqHost),
        ),
    ));
    render();
    source.focus();
}

/* ========================================================================== */
/* Slug generator                                                             */
/* ========================================================================== */

export function slugGenerator(host) {
    const source = textarea({ placeholder: "How to deploy a static site — 2026 edition", size: "sm", "aria-label": "Text" });
    const separator = select([{ value: "-", label: "Hyphen (-)" }, { value: "_", label: "Underscore (_)" }], { value: "-" });
    const maxLength = input({ type: "number", value: "0", min: "0", max: "200" });
    const output = codeOutput("Slugs appear here");
    const status = statusBox();
    let lowercase = true;
    let stripStopWords = false;

    const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by"]);

    function slugify(text) {
        let words = text
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (stripStopWords) {
            const filtered = words.filter((word) => !STOP_WORDS.has(word.toLowerCase()));
            if (filtered.length) words = filtered;
        }
        let slug = words.join(separator.value);
        if (lowercase) slug = slug.toLowerCase();
        const limit = Number(maxLength.value) || 0;
        if (limit > 0 && slug.length > limit) {
            slug = slug.slice(0, limit).replace(new RegExp(`${separator.value}[^${separator.value}]*$`), "");
        }
        return slug;
    }

    function render() {
        const lines = toLines(source.value).filter((line) => line.trim());
        status.reset();
        if (!lines.length) {
            output.setValue("");
            return;
        }
        const slugs = lines.map(slugify);
        output.setValue(slugs.join("\n"));
        status.success(`${formatNumber(slugs.length)} slug${slugs.length === 1 ? "" : "s"} generated`);
    }

    for (const control of [source, separator, maxLength]) {
        control.addEventListener("input", render);
        control.addEventListener("change", render);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Text", meta: countMeta(source) },
            source,
            el("p", { class: "small muted", text: "One slug is produced per line." }),
        ),
        panel(
            { title: "Options" },
            el(
                "div",
                { class: "form-grid" },
                field("Separator", separator),
                field("Max length", maxLength, { hint: "0 means no limit" }),
            ),
            el(
                "div",
                { class: "check-grid" },
                checkbox("Lowercase", { checked: true, onChange: (checked) => { lowercase = checked; render(); } }),
                checkbox("Remove stop words", { onChange: (checked) => { stripStopWords = checked; render(); } }),
            ),
        ),
        status,
        panel({ title: "Slugs", actions: [copyButton(() => output.getValue(), { small: true })] }, output),
    ));

    render();
    source.focus();
}
