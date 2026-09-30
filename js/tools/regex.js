"use strict";

import { el, panel, input, textarea, field, checkbox, statusBox, dataTable, metaLabel } from "../ui.js";
import { debounce, formatNumber } from "../utils.js";

const FLAGS = [
    { flag: "g", label: "g — global", default: true },
    { flag: "i", label: "i — ignore case", default: true },
    { flag: "m", label: "m — multiline", default: true },
    { flag: "s", label: "s — dot matches newline", default: false },
    { flag: "u", label: "u — unicode", default: false },
    { flag: "y", label: "y — sticky", default: false },
];

const MAX_MATCHES = 500;

export function regexTester(host) {
    const patternInput = input({ placeholder: "\\b\\w+@\\w+\\.\\w+\\b", class: "input mono" });
    const testInput = textarea({
        placeholder: "Text to test against the pattern…",
        "aria-label": "Test string",
    });
    const status = statusBox();
    const preview = el("div", { class: "code-out", "data-placeholder": "Matches are highlighted here" });
    const matchMeta = metaLabel("");
    const detailHost = el("div", {});

    const flagState = new Map(FLAGS.map(({ flag, default: on }) => [flag, on]));
    const flagBoxes = el(
        "div",
        { class: "check-grid" },
        ...FLAGS.map(({ flag, label, default: on }) => checkbox(label, {
            checked: on,
            onChange: (checked) => {
                flagState.set(flag, checked);
                run();
            },
        })),
    );

    function currentFlags() {
        return FLAGS.map(({ flag }) => flag).filter((flag) => flagState.get(flag)).join("");
    }

    function renderHighlight(text, matches) {
        preview.replaceChildren();
        if (!matches.length) {
            preview.append(document.createTextNode(text));
            return;
        }
        let cursor = 0;
        for (const match of matches) {
            if (match.index > cursor) preview.append(document.createTextNode(text.slice(cursor, match.index)));
            preview.append(el("mark", { class: "hit", text: match[0] === "" ? "∅" : match[0] }));
            cursor = match.index + (match[0].length || 1);
        }
        if (cursor < text.length) preview.append(document.createTextNode(text.slice(cursor)));
    }

    function renderDetails(matches) {
        detailHost.replaceChildren();
        if (!matches.length) return;

        const rows = matches.slice(0, 50).map((match, index) => {
            const groups = match.slice(1).map((group, gi) => `${gi + 1}: ${group === undefined ? "—" : group}`);
            const named = match.groups
                ? Object.entries(match.groups).map(([name, value]) => `${name}: ${value ?? "—"}`)
                : [];
            return [
                String(index + 1),
                match[0] === "" ? "(empty match)" : match[0],
                `${match.index}–${match.index + match[0].length}`,
                [...groups, ...named].join("\n") || "—",
            ];
        });

        detailHost.append(panel(
            { title: "Match details", meta: metaLabel(matches.length > 50 ? "showing first 50" : "") },
            dataTable(["#", "Match", "Position", "Groups"], rows),
        ));
    }

    function run() {
        const pattern = patternInput.value;
        const text = testInput.value;
        status.reset();
        matchMeta.textContent = "";

        if (!pattern) {
            renderHighlight(text, []);
            detailHost.replaceChildren();
            return;
        }

        let regex;
        try {
            regex = new RegExp(pattern, currentFlags());
        } catch (error) {
            status.error("Invalid regular expression", error.message);
            renderHighlight(text, []);
            detailHost.replaceChildren();
            return;
        }

        const matches = [];
        if (regex.global || regex.sticky) {
            regex.lastIndex = 0;
            let match = regex.exec(text);
            while (match !== null && matches.length < MAX_MATCHES) {
                matches.push(match);
                if (match[0] === "") regex.lastIndex += 1;
                match = regex.exec(text);
            }
        } else {
            const match = regex.exec(text);
            if (match) matches.push(match);
        }

        renderHighlight(text, matches);
        renderDetails(matches);
        matchMeta.textContent = `${formatNumber(matches.length)} match${matches.length === 1 ? "" : "es"}`;
        if (matches.length === 0) status.warn("No matches found");
        else status.success(`${formatNumber(matches.length)} match${matches.length === 1 ? "" : "es"}`);
    }

    const debouncedRun = debounce(run, 120);
    patternInput.addEventListener("input", debouncedRun);
    testInput.addEventListener("input", debouncedRun);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Pattern" },
            field("Regular expression", patternInput, { hint: "Write the body only — no surrounding slashes." }),
            el("span", { class: "field-label", text: "Flags" }),
            flagBoxes,
        ),
        panel({ title: "Test string" }, testInput),
        status,
        panel({ title: "Preview", meta: matchMeta }, preview),
        detailHost,
    ));

    patternInput.focus();
}
