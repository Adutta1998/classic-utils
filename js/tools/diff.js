"use strict";

import {
    el, panel, textarea, checkbox, statusBox, dataTable, copyButton, countMeta, button, metaLabel,
} from "../ui.js";
import { toLines, formatNumber } from "../utils.js";

const MAX_DIFF_LINES = 2000;

/** Classic LCS diff over lines. Returns [{ type, text }]. */
export function diffLines(left, right) {
    const a = left;
    const b = right;
    const n = a.length;
    const m = b.length;

    const table = new Int32Array((n + 1) * (m + 1));
    const at = (i, j) => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            table[at(i, j)] = a[i] === b[j]
                ? table[at(i + 1, j + 1)] + 1
                : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
        }
    }

    const result = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            result.push({ type: "same", text: a[i] });
            i += 1;
            j += 1;
        } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
            result.push({ type: "del", text: a[i] });
            i += 1;
        } else {
            result.push({ type: "add", text: b[j] });
            j += 1;
        }
    }
    while (i < n) { result.push({ type: "del", text: a[i] }); i += 1; }
    while (j < m) { result.push({ type: "add", text: b[j] }); j += 1; }
    return result;
}

export function textDiff(host) {
    const leftInput = textarea({ placeholder: "Original text…", "aria-label": "Original text" });
    const rightInput = textarea({ placeholder: "Changed text…", "aria-label": "Changed text" });
    const status = statusBox();
    const view = el("div", { class: "code-out", "data-placeholder": "Differences appear here" });
    const summary = metaLabel("");
    let ignoreCase = false;
    let ignoreWhitespace = false;
    let onlyChanges = false;
    let unified = "";

    function normalize(lines) {
        return lines.map((line) => {
            let value = line;
            if (ignoreWhitespace) value = value.trim().replace(/\s+/g, " ");
            if (ignoreCase) value = value.toLowerCase();
            return value;
        });
    }

    function run() {
        status.reset();
        view.replaceChildren();
        const leftLines = toLines(leftInput.value);
        const rightLines = toLines(rightInput.value);

        if (!leftLines.length && !rightLines.length) {
            summary.textContent = "";
            unified = "";
            return;
        }
        if (leftLines.length > MAX_DIFF_LINES || rightLines.length > MAX_DIFF_LINES) {
            status.error("Input too large", `This diff is limited to ${formatNumber(MAX_DIFF_LINES)} lines per side.`);
            return;
        }

        const keysLeft = normalize(leftLines);
        const keysRight = normalize(rightLines);
        const rawDiff = diffLines(keysLeft, keysRight);

        // Map normalised results back to the original text for display.
        let li = 0;
        let ri = 0;
        const parts = rawDiff.map((entry) => {
            if (entry.type === "del") return { type: "del", text: leftLines[li++] };
            if (entry.type === "add") return { type: "add", text: rightLines[ri++] };
            const text = leftLines[li++];
            ri += 1;
            return { type: "same", text };
        });

        let added = 0;
        let removed = 0;
        const unifiedLines = [];
        for (const part of parts) {
            if (part.type === "add") added += 1;
            if (part.type === "del") removed += 1;
            if (onlyChanges && part.type === "same") continue;
            const glyph = part.type === "add" ? "+" : part.type === "del" ? "-" : " ";
            const cssClass = part.type === "add" ? "diff-add" : part.type === "del" ? "diff-del" : "diff-ctx";
            view.append(el("span", { class: `diff-line ${cssClass}`, text: `${glyph} ${part.text}` }));
            unifiedLines.push(`${glyph} ${part.text}`);
        }

        unified = unifiedLines.join("\n");
        summary.textContent = `+${formatNumber(added)} / -${formatNumber(removed)} · ${formatNumber(parts.length - added - removed)} unchanged`;
        if (added === 0 && removed === 0) status.success("The two texts are identical");
        else status.warn(`${formatNumber(added)} added, ${formatNumber(removed)} removed`);
    }

    for (const control of [leftInput, rightInput]) control.addEventListener("input", run);

    host.append(el(
        "div",
        { class: "tool-body" },
        el(
            "div",
            { class: "io-grid" },
            panel({ title: "Original", meta: countMeta(leftInput) }, leftInput),
            panel({ title: "Changed", meta: countMeta(rightInput) }, rightInput),
        ),
        panel(
            { title: "Options" },
            el(
                "div",
                { class: "check-grid" },
                checkbox("Ignore case", { onChange: (checked) => { ignoreCase = checked; run(); } }),
                checkbox("Ignore whitespace", { onChange: (checked) => { ignoreWhitespace = checked; run(); } }),
                checkbox("Only show changes", { onChange: (checked) => { onlyChanges = checked; run(); } }),
            ),
            el("div", { class: "btn-row" }, button("Swap sides", {
                glyph: "⇄",
                small: true,
                onClick: () => {
                    const temp = leftInput.value;
                    leftInput.value = rightInput.value;
                    rightInput.value = temp;
                    leftInput.dispatchEvent(new Event("input"));
                    rightInput.dispatchEvent(new Event("input"));
                },
            })),
        ),
        status,
        panel(
            { title: "Differences", meta: summary, actions: [copyButton(() => unified, { small: true })] },
            view,
        ),
    ));

    leftInput.focus();
}

/* ========================================================================== */
/* Git diff statistics                                                        */
/* ========================================================================== */

export function gitDiffStats(host) {
    const source = textarea({
        placeholder: "Paste the output of: git diff\n\ndiff --git a/app.js b/app.js\n@@ -1,4 +1,6 @@\n+const x = 1;\n-const y = 2;",
        size: "lg",
        "aria-label": "Unified diff",
    });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function analyse() {
        status.reset();
        resultHost.replaceChildren();
        const text = source.value;
        if (!text.trim()) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Paste a unified diff to see its statistics." }));
            return;
        }

        const files = [];
        let current = null;
        for (const line of toLines(text)) {
            const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
            if (header) {
                current = { name: header[2], added: 0, removed: 0, binary: false };
                files.push(current);
                continue;
            }
            const plusPlus = /^\+\+\+ b?\/?(.+)$/.exec(line);
            if (plusPlus && !current) {
                current = { name: plusPlus[1], added: 0, removed: 0, binary: false };
                files.push(current);
                continue;
            }
            if (!current) continue;
            if (line.startsWith("Binary files")) current.binary = true;
            else if (line.startsWith("+++") || line.startsWith("---")) continue;
            else if (line.startsWith("+")) current.added += 1;
            else if (line.startsWith("-")) current.removed += 1;
        }

        if (!files.length) {
            status.error("No diff headers found", "Expected lines starting with 'diff --git' or '+++'.");
            return;
        }

        const totals = files.reduce(
            (acc, file) => ({ added: acc.added + file.added, removed: acc.removed + file.removed }),
            { added: 0, removed: 0 },
        );

        resultHost.append(dataTable(
            ["File", "Added", "Removed", "Net"],
            files.map((file) => [
                file.name,
                file.binary ? "binary" : `+${file.added}`,
                file.binary ? "binary" : `-${file.removed}`,
                file.binary ? "—" : String(file.added - file.removed),
            ]),
        ));

        copyText = [
            ...files.map((file) => `${file.name}: +${file.added} -${file.removed}`),
            `${files.length} files changed, ${totals.added} insertions(+), ${totals.removed} deletions(-)`,
        ].join("\n");

        status.success(
            `${formatNumber(files.length)} file${files.length === 1 ? "" : "s"} changed`,
            `${formatNumber(totals.added)} insertions(+), ${formatNumber(totals.removed)} deletions(-)`,
        );
    }

    source.addEventListener("input", analyse);
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Unified diff", meta: countMeta(source) }, source),
        status,
        panel({ title: "Per-file statistics", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    analyse();
    source.focus();
}
