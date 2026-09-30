"use strict";

import {
    createIO, el, panel, input, field, select, checkbox, segmented, codeOutput,
    copyButton, downloadButton, statusBox, textarea, countMeta,
} from "../ui.js";
import { parseJson } from "../lib/json-error.js";
import { splitWords, titleCaseWord, toLines, formatNumber } from "../utils.js";

const toPascal = (text) => splitWords(text).map(titleCaseWord).join("") || "Model";
const toSnake = (text) => splitWords(text).map((word) => word.toLowerCase()).join("_");
const isIdentifier = (text) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) && !PY_KEYWORDS.has(text);

const PY_KEYWORDS = new Set([
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import",
    "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while",
    "with", "yield",
]);

/* ========================================================================== */
/* Shared model inference                                                     */
/* ========================================================================== */

function inferType(value, name, models) {
    if (value === null) return { type: "None", optional: true };
    if (Array.isArray(value)) {
        if (!value.length) return { type: "list[Any]" };
        const itemTypes = new Set();
        const objects = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
        if (objects.length === value.length) {
            const merged = mergeObjects(objects);
            const modelName = buildModel(merged.shape, name, models, merged.optionalKeys);
            return { type: `list[${modelName}]` };
        }
        for (const item of value) itemTypes.add(inferType(item, name, models).type);
        const unique = [...itemTypes].filter((type) => type !== "None");
        if (!unique.length) return { type: "list[Any]" };
        return { type: `list[${unique.length === 1 ? unique[0] : unique.join(" | ")}]` };
    }
    if (typeof value === "object") {
        return { type: buildModel(value, name, models, new Set()) };
    }
    if (typeof value === "boolean") return { type: "bool" };
    if (typeof value === "number") return { type: Number.isInteger(value) ? "int" : "float" };
    if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(value)) return { type: "datetime" };
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: "date" };
        return { type: "str" };
    }
    return { type: "Any" };
}

function mergeObjects(objects) {
    const shape = {};
    const counts = new Map();
    for (const object of objects) {
        for (const [key, value] of Object.entries(object)) {
            counts.set(key, (counts.get(key) ?? 0) + 1);
            if (!(key in shape) || shape[key] === null) shape[key] = value;
        }
    }
    const optionalKeys = new Set(
        [...counts.entries()].filter(([, count]) => count < objects.length).map(([key]) => key),
    );
    return { shape, optionalKeys };
}

function buildModel(object, name, models, optionalKeys) {
    const modelName = uniqueName(toPascal(name), models);
    const fields = [];
    const placeholder = { name: modelName, fields };
    models.push(placeholder);

    for (const [key, value] of Object.entries(object)) {
        const info = inferType(value, key, models);
        fields.push({
            key,
            name: isIdentifier(toSnake(key)) ? toSnake(key) : null,
            type: info.type === "None" ? "Any" : info.type,
            optional: info.optional || optionalKeys.has(key),
        });
    }
    return modelName;
}

function uniqueName(base, models) {
    let name = base;
    let counter = 2;
    while (models.some((model) => model.name === name)) {
        name = `${base}${counter}`;
        counter += 1;
    }
    return name;
}

function collectImports(models) {
    const text = models.flatMap((model) => model.fields.map((item) => item.type)).join(" ");
    const typing = [];
    if (text.includes("Any")) typing.push("Any");
    const datetimeImports = [];
    if (/\bdatetime\b/.test(text)) datetimeImports.push("datetime");
    if (/\bdate\b/.test(text)) datetimeImports.push("date");
    return { typing, datetimeImports };
}

/* ========================================================================== */
/* JSON → Pydantic                                                            */
/* ========================================================================== */

const SAMPLE_JSON = `{
  "id": 42,
  "name": "Ada Lovelace",
  "active": true,
  "score": 9.5,
  "created_at": "2026-01-15T09:30:00Z",
  "address": { "city": "London", "postcode": "E1 6AN" },
  "tags": ["admin", "beta"]
}`;

function renderPydantic(models, rootName) {
    const { typing, datetimeImports } = collectImports(models);
    const needsField = models.some((model) => model.fields.some((item) => item.name !== item.key));
    const header = ["from __future__ import annotations", ""];
    if (datetimeImports.length) header.push(`from datetime import ${datetimeImports.sort().join(", ")}`);
    if (typing.length) header.push(`from typing import ${typing.join(", ")}`);
    header.push("", `from pydantic import BaseModel${needsField ? ", Field" : ""}`, "", "");

    const blocks = [...models].reverse().map((model) => {
        const lines = [`class ${model.name}(BaseModel):`];
        if (!model.fields.length) {
            lines.push("    pass");
            return lines.join("\n");
        }
        for (const item of model.fields) {
            const type = item.optional ? `${item.type} | None` : item.type;
            if (item.name === null) {
                lines.push(`    ${toSnake(item.key) || "field"}: ${type} = Field(${item.optional ? "default=None, " : ""}alias="${item.key}")`);
            } else if (item.name !== item.key) {
                lines.push(`    ${item.name}: ${type} = Field(${item.optional ? "default=None, " : ""}alias="${item.key}")`);
            } else {
                lines.push(`    ${item.name}: ${type}${item.optional ? " = None" : ""}`);
            }
        }
        return lines.join("\n");
    });

    return `${header.join("\n")}${blocks.join("\n\n\n")}\n\n\n# Usage\n# model = ${rootName}.model_validate(payload)\n`;
}

function renderDataclass(models, rootName) {
    const { typing, datetimeImports } = collectImports(models);
    const header = ["from __future__ import annotations", "", "from dataclasses import dataclass, field"];
    if (datetimeImports.length) header.push(`from datetime import ${datetimeImports.sort().join(", ")}`);
    if (typing.length) header.push(`from typing import ${typing.join(", ")}`);
    header.push("", "");

    const blocks = [...models].reverse().map((model) => {
        const lines = ["@dataclass", `class ${model.name}:`];
        if (!model.fields.length) {
            lines.push("    pass");
            return lines.join("\n");
        }
        // Fields without defaults must come first in a dataclass.
        const ordered = [...model.fields].sort((a, b) => Number(a.optional) - Number(b.optional));
        for (const item of ordered) {
            const name = item.name ?? `${toSnake(item.key) || "value"}`;
            const type = item.optional ? `${item.type} | None` : item.type;
            const comment = name !== item.key ? `  # JSON key: ${item.key}` : "";
            if (item.optional) lines.push(`    ${name}: ${type} = None${comment}`);
            else if (item.type.startsWith("list[")) lines.push(`    ${name}: ${type} = field(default_factory=list)${comment}`);
            else lines.push(`    ${name}: ${type}${comment}`);
        }
        return lines.join("\n");
    });

    return `${header.join("\n")}${blocks.join("\n\n\n")}\n\n\n# Usage\n# instance = ${rootName}(**payload)\n`;
}

function modelTool(host, { renderer, rootDefault, downloadName }) {
    const rootInput = input({ value: rootDefault });

    const io = createIO({
        inputLabel: "JSON sample",
        inputPlaceholder: SAMPLE_JSON,
        outputLabel: "Python",
        outputPlaceholder: "Generated classes appear here",
        downloadName,
        actions: [{ label: "Generate", glyph: "▶", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        io.status.reset();
        const text = io.input.value.trim();
        if (!text) {
            io.setOutput("");
            return;
        }
        try {
            const parsed = parseJson(text);
            const rootName = toPascal(rootInput.value || rootDefault);
            const models = [];
            const sample = Array.isArray(parsed) ? parsed.find((item) => item && typeof item === "object") : parsed;
            if (!sample || typeof sample !== "object") {
                throw new Error("Provide a JSON object, or an array of objects.");
            }
            buildModel(sample, rootName, models, new Set());
            io.setOutput(renderer(models, models[0].name));
            io.status.success(`${models.length} class${models.length === 1 ? "" : "es"} generated`);
        } catch (error) {
            io.setOutput("");
            io.status.error("Could not generate models", error.message);
        }
    }

    rootInput.addEventListener("input", run);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Options" },
            field("Root class name", rootInput),
            el("button", {
                class: "btn btn-sm",
                type: "button",
                style: { alignSelf: "flex-start" },
                text: "Load example",
                onClick: () => {
                    io.input.value = SAMPLE_JSON;
                    io.input.dispatchEvent(new Event("input"));
                },
            }),
        ),
        io.node,
    ));
    io.input.focus();
}

export function jsonToPydantic(host) {
    modelTool(host, { renderer: renderPydantic, rootDefault: "Model", downloadName: "models.py" });
}

export function jsonToDataclass(host) {
    modelTool(host, { renderer: renderDataclass, rootDefault: "Model", downloadName: "models.py" });
}

/* ========================================================================== */
/* Requirements generator                                                     */
/* ========================================================================== */

export function requirementsGenerator(host) {
    let pinStyle = "==";
    let sort = true;

    const io = createIO({
        inputLabel: "Packages",
        inputPlaceholder: "requests 2.32.3\nflask==3.0.0\npydantic\n# comments are kept",
        outputLabel: "requirements.txt",
        outputPlaceholder: "The normalised list appears here",
        downloadName: "requirements.txt",
        actions: [{ label: "Generate", glyph: "▶", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        io.status.reset();
        const lines = toLines(io.input.value);
        if (!lines.length) {
            io.setOutput("");
            return;
        }

        const comments = [];
        const packages = new Map();
        for (const line of lines) {
            const text = line.trim();
            if (!text) continue;
            if (text.startsWith("#")) {
                comments.push(text);
                continue;
            }
            const match = /^([A-Za-z0-9._-]+)\s*(\[[^\]]+\])?\s*(?:[=<>~!]=?\s*)?([0-9][\w.*+!-]*)?/.exec(text);
            if (!match) continue;
            const [, name, extras = "", version = ""] = match;
            packages.set(name.toLowerCase(), { name, extras, version });
        }

        if (!packages.size) {
            io.setOutput("");
            io.status.error("No package names found", "Write one package per line, optionally with a version.");
            return;
        }

        let entries = [...packages.values()];
        if (sort) entries.sort((a, b) => a.name.localeCompare(b.name));

        const body = entries.map(({ name, extras, version }) => {
            if (!version) return `${name}${extras}`;
            if (pinStyle === "none") return `${name}${extras}`;
            return `${name}${extras}${pinStyle}${version}`;
        });

        const output = [...comments, ...(comments.length ? [""] : []), ...body].join("\n");
        io.setOutput(`${output}\n`);
        io.status.success(`${formatNumber(entries.length)} packages`, entries.filter((e) => !e.version).length
            ? `${entries.filter((e) => !e.version).length} without a version — pin them for reproducible builds.`
            : "");
    }

    const options = panel(
        { title: "Options" },
        segmented(
            [
                { value: "==", label: "Exact (==)" },
                { value: "~=", label: "Compatible (~=)" },
                { value: ">=", label: "Minimum (>=)" },
                { value: "none", label: "No version" },
            ],
            { value: pinStyle, label: "Pin style", onChange: (value) => { pinStyle = value; run(); } },
        ),
        checkbox("Sort alphabetically", { checked: true, onChange: (checked) => { sort = checked; run(); } }),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}

/* ========================================================================== */
/* .env generator                                                             */
/* ========================================================================== */

const SECRET_HINT = /(secret|token|password|passwd|key|credential|private)/i;

export function envGenerator(host) {
    const source = textarea({
        placeholder: "DATABASE_URL=postgres://localhost:5432/app\nAPI_TOKEN=replace-me\nDEBUG=true",
        size: "lg",
        "aria-label": "Environment variables",
    });
    const status = statusBox();
    const envOut = codeOutput(".env appears here");
    const exampleOut = codeOutput(".env.example appears here");
    const shellOut = codeOutput("Shell exports appear here");
    let upperCaseKeys = true;
    let quoteValues = false;

    function parse() {
        const entries = [];
        for (const line of toLines(source.value)) {
            const text = line.trim();
            if (!text) continue;
            if (text.startsWith("#")) {
                entries.push({ comment: text });
                continue;
            }
            const splitAt = text.search(/[=:]/);
            if (splitAt === -1) {
                entries.push({ key: text, value: "" });
                continue;
            }
            entries.push({ key: text.slice(0, splitAt).trim(), value: text.slice(splitAt + 1).trim() });
        }
        return entries;
    }

    function formatKey(key) {
        const normalized = splitWords(key).map((word) => word.toUpperCase()).join("_");
        return upperCaseKeys ? normalized : key;
    }

    function formatValue(value) {
        if (!quoteValues) return value;
        return /^["'].*["']$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`;
    }

    function build() {
        const entries = parse();
        status.reset();
        if (!entries.length) {
            for (const out of [envOut, exampleOut, shellOut]) out.setValue("");
            return;
        }

        const env = [];
        const example = [];
        const shell = [];
        let secrets = 0;

        for (const entry of entries) {
            if (entry.comment) {
                env.push(entry.comment);
                example.push(entry.comment);
                continue;
            }
            const key = formatKey(entry.key);
            env.push(`${key}=${formatValue(entry.value)}`);
            const isSecret = SECRET_HINT.test(key);
            if (isSecret) secrets += 1;
            example.push(`${key}=${isSecret ? "" : formatValue(entry.value)}`);
            shell.push(`export ${key}=${formatValue(entry.value) || '""'}`);
        }

        envOut.setValue(`${env.join("\n")}\n`);
        exampleOut.setValue(`${example.join("\n")}\n`);
        shellOut.setValue(`${shell.join("\n")}\n`);

        if (secrets) {
            status.warn(
                `${secrets} value${secrets === 1 ? " looks" : "s look"} like a secret`,
                "They were blanked out in .env.example. Add .env to .gitignore and never commit real values.",
            );
        } else {
            status.success(`${formatNumber(shell.length)} variables`);
        }
    }

    source.addEventListener("input", build);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Variables", meta: countMeta(source) },
            source,
            el(
                "div",
                { class: "check-grid" },
                checkbox("Normalise keys to UPPER_SNAKE_CASE", { checked: true, onChange: (v) => { upperCaseKeys = v; build(); } }),
                checkbox("Quote values", { onChange: (v) => { quoteValues = v; build(); } }),
            ),
        ),
        status,
        el(
            "div",
            { class: "io-grid" },
            panel(
                {
                    title: ".env",
                    actions: [
                        copyButton(() => envOut.getValue(), { small: true }),
                        downloadButton(() => envOut.getValue(), ".env", { small: true }),
                    ],
                },
                envOut,
            ),
            panel(
                {
                    title: ".env.example",
                    actions: [
                        copyButton(() => exampleOut.getValue(), { small: true }),
                        downloadButton(() => exampleOut.getValue(), ".env.example", { small: true }),
                    ],
                },
                exampleOut,
            ),
        ),
        panel({ title: "Shell exports", actions: [copyButton(() => shellOut.getValue(), { small: true })] }, shellOut),
        el("p", { class: "small muted", text: "Nothing you type here is stored — the values never leave this page." }),
    ));

    build();
    source.focus();
}

/* ========================================================================== */
/* Python dict formatter                                                      */
/* ========================================================================== */

function toPythonLiteral(value, indent, level) {
    const pad = " ".repeat(indent * (level + 1));
    const closePad = " ".repeat(indent * level);

    if (value === null) return "None";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

    if (Array.isArray(value)) {
        if (!value.length) return "[]";
        const items = value.map((item) => `${pad}${toPythonLiteral(item, indent, level + 1)}`);
        return `[\n${items.join(",\n")},\n${closePad}]`;
    }

    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    const items = entries.map(([key, item]) =>
        `${pad}"${key.replace(/"/g, '\\"')}": ${toPythonLiteral(item, indent, level + 1)}`);
    return `{\n${items.join(",\n")},\n${closePad}}`;
}

export function dictFormatter(host) {
    const indentSelect = select([{ value: "4", label: "4 spaces" }, { value: "2", label: "2 spaces" }], { value: "4" });
    const variableInput = input({ value: "data" });

    const io = createIO({
        inputLabel: "JSON",
        inputPlaceholder: SAMPLE_JSON,
        outputLabel: "Python",
        outputPlaceholder: "The Python dict appears here",
        downloadName: "data.py",
        actions: [{ label: "Convert", glyph: "▶", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        io.status.reset();
        const text = io.input.value.trim();
        if (!text) {
            io.setOutput("");
            return;
        }
        try {
            const parsed = parseJson(text);
            const indent = Number(indentSelect.value);
            const name = toSnake(variableInput.value) || "data";
            io.setOutput(`${name} = ${toPythonLiteral(parsed, indent, 0)}\n`);
            io.status.success("Converted — true/false/null became True/False/None");
        } catch (error) {
            io.setOutput("");
            io.status.error("Invalid JSON", error.message);
        }
    }

    for (const control of [indentSelect, variableInput]) {
        control.addEventListener("input", run);
        control.addEventListener("change", run);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Options" },
            el("div", { class: "form-grid" }, field("Variable name", variableInput), field("Indentation", indentSelect)),
        ),
        io.node,
    ));
    io.input.focus();
}
