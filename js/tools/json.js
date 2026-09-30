"use strict";

import { createIO, el, field, select, panel, toast } from "../ui.js";
import { parseJson, sortKeysDeep } from "../lib/json-error.js";
import { formatNumber } from "../utils.js";

const SAMPLE = `{
  "name": "John",
  "age": 30,
  "roles": ["admin", "dev"],
  "active": true
}`;

export function jsonFormatter(host) {
    const indentSelect = select(
        [
            { value: "2", label: "2 spaces" },
            { value: "4", label: "4 spaces" },
            { value: "\t", label: "Tab" },
        ],
        { value: "2" },
    );

    const io = createIO({
        inputLabel: "JSON input",
        inputPlaceholder: SAMPLE,
        outputLabel: "Result",
        outputPlaceholder: "Formatted JSON appears here",
        downloadName: "formatted.json",
        downloadMime: "application/json;charset=utf-8",
        actions: [
            { label: "Format", glyph: "{ }", primary: true, onClick: () => run("format") },
            { label: "Minify", glyph: "⇥", onClick: () => run("minify") },
            { label: "Validate", glyph: "✓", onClick: () => run("validate") },
            { label: "Sort keys", glyph: "↓", onClick: () => run("sort") },
        ],
        onRun: () => run("format"),
    });

    const indentValue = () => (indentSelect.value === "\t" ? "\t" : Number(indentSelect.value));

    function describe(value) {
        if (Array.isArray(value)) return `Valid JSON array · ${formatNumber(value.length)} items`;
        if (value && typeof value === "object") return `Valid JSON object · ${formatNumber(Object.keys(value).length)} keys`;
        return `Valid JSON ${value === null ? "null" : typeof value}`;
    }

    function run(mode) {
        const text = io.input.value.trim();
        if (!text) {
            io.status.warn("Nothing to process", "Paste some JSON first.");
            io.setOutput("");
            return;
        }
        try {
            const parsed = parseJson(text);
            if (mode === "validate") {
                io.status.success(describe(parsed));
                io.setOutput(JSON.stringify(parsed, null, indentValue()));
                return;
            }
            const value = mode === "sort" ? sortKeysDeep(parsed) : parsed;
            const output = mode === "minify"
                ? JSON.stringify(value)
                : JSON.stringify(value, null, indentValue());
            io.setOutput(output);
            io.status.success(describe(parsed));
        } catch (error) {
            io.setOutput("");
            io.status.error("Invalid JSON", error.message);
        }
    }

    const options = panel(
        { title: "Options" },
        el(
            "div",
            { class: "inline-row" },
            field("Indentation", indentSelect),
            el(
                "div",
                { class: "field" },
                el("span", { class: "field-label", text: "Sample" }),
                el("button", {
                    class: "btn btn-sm",
                    type: "button",
                    text: "Load example",
                    onClick: () => {
                        io.input.value = SAMPLE;
                        io.input.dispatchEvent(new Event("input"));
                        run("format");
                        toast("Example loaded", "info", 1500);
                    },
                }),
            ),
        ),
        el("p", { class: "small muted", text: "Tip: press Ctrl + Enter inside the input to format." }),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}
