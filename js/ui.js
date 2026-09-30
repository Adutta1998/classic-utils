"use strict";

/**
 * Reusable UI primitives. Every component is built with safe DOM APIs —
 * user-provided content is only ever assigned through `textContent`.
 */

import { copyToClipboard, downloadText, byteLength, formatNumber } from "./utils.js";

/* --- Element factory ----------------------------------------------------- */

export function append(parent, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false || child === true) continue;
        parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return parent;
}

export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style") Object.assign(node.style, value);
        else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in node && typeof value !== "object") {
            node[key] = value;
        } else {
            node.setAttribute(key, value === true ? "" : String(value));
        }
    }
    return append(node, children);
}

export function frag(...children) {
    return append(document.createDocumentFragment(), children);
}

export function clear(node) {
    node.replaceChildren();
    return node;
}

/* --- Toasts -------------------------------------------------------------- */

const TOAST_GLYPHS = { success: "✓", error: "✕", warning: "⚠", info: "•" };

export function toast(message, type = "success", duration = 2600) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const node = el(
        "div",
        { class: `toast toast-${type}` },
        el("span", { class: "toast-glyph", "aria-hidden": "true", text: TOAST_GLYPHS[type] ?? "•" }),
        el("span", { text: message }),
    );
    stack.append(node);
    const remove = () => {
        node.classList.add("leaving");
        node.addEventListener("animationend", () => node.remove(), { once: true });
        setTimeout(() => node.remove(), 400);
    };
    setTimeout(remove, duration);
}

/* --- Modal --------------------------------------------------------------- */

export function openModal({ title, body, actions = [] }) {
    const previouslyFocused = document.activeElement;
    const close = () => {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    const onKeydown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    };

    const dialog = el(
        "div",
        { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
        el(
            "div",
            { class: "modal-head" },
            el("h2", { text: title }),
            el("span", { class: "spacer" }),
            el("button", {
                class: "icon-btn",
                type: "button",
                "aria-label": "Close dialog",
                onClick: close,
                text: "✕",
            }),
        ),
        body,
        actions.length
            ? el("div", { class: "btn-row end", style: { marginTop: "16px" } },
                ...actions.map((action) => button(action.label, { ...action, onClick: () => action.onClick?.(close) })))
            : null,
    );

    const backdrop = el("div", {
        class: "modal-backdrop",
        onClick: (event) => { if (event.target === backdrop) close(); },
    }, dialog);

    document.body.append(backdrop);
    document.addEventListener("keydown", onKeydown);
    dialog.querySelector("button")?.focus();
    return close;
}

/* --- Buttons ------------------------------------------------------------- */

export function button(label, { variant = "", glyph, onClick, type = "button", title, small, block, disabled } = {}) {
    const classes = ["btn"];
    if (variant) classes.push(`btn-${variant}`);
    if (small) classes.push("btn-sm");
    if (block) classes.push("btn-block");
    return el(
        "button",
        { class: classes.join(" "), type, title: title ?? null, disabled: disabled ?? null, onClick },
        glyph ? el("span", { class: "btn-glyph", "aria-hidden": "true", text: glyph }) : null,
        el("span", { text: label }),
    );
}

export function iconButton(glyph, { label, onClick, pressed } = {}) {
    return el("button", {
        class: "icon-btn",
        type: "button",
        "aria-label": label,
        title: label,
        "aria-pressed": pressed === undefined ? null : String(pressed),
        onClick,
        text: glyph,
    });
}

export function copyButton(getText, { label = "Copy", small = false } = {}) {
    return button(label, {
        glyph: "⧉",
        small,
        onClick: async () => {
            const text = getText();
            if (!text) {
                toast("Nothing to copy", "warning");
                return;
            }
            const ok = await copyToClipboard(text);
            toast(ok ? "Copied to clipboard" : "Copy failed — select the text manually", ok ? "success" : "error");
        },
    });
}

export function downloadButton(getText, filename, { label = "Download", mime, small = false } = {}) {
    return button(label, {
        glyph: "↓",
        small,
        onClick: () => {
            const text = getText();
            if (!text) {
                toast("Nothing to download", "warning");
                return;
            }
            downloadText(typeof filename === "function" ? filename() : filename, text, mime);
            toast("Download started");
        },
    });
}

/* --- Form controls ------------------------------------------------------- */

let autoId = 0;
const nextId = () => `dt-${(autoId += 1)}`;

export function field(label, control, { hint, id } = {}) {
    const controlId = id ?? control.id ?? nextId();
    control.id = controlId;
    return el(
        "div",
        { class: "field" },
        el("label", { class: "field-label", for: controlId, text: label }),
        control,
        hint ? el("span", { class: "field-hint", text: hint }) : null,
    );
}

export function input(props = {}) {
    return el("input", { class: "input", type: "text", spellcheck: "false", ...props });
}

export function textarea(props = {}) {
    const { size, ...rest } = props;
    return el("textarea", {
        class: `textarea${size ? ` ${size}` : ""}`,
        spellcheck: "false",
        autocapitalize: "off",
        autocomplete: "off",
        ...rest,
    });
}

export function select(options, props = {}) {
    const node = el("select", { class: "select", ...props });
    for (const option of options) {
        const { value, label } = typeof option === "string" ? { value: option, label: option } : option;
        node.append(el("option", { value, text: label }));
    }
    if (props.value !== undefined) node.value = props.value;
    return node;
}

export function checkbox(label, { checked = false, onChange, value } = {}) {
    const box = el("input", { type: "checkbox", checked, value: value ?? label });
    if (onChange) box.addEventListener("change", () => onChange(box.checked));
    return el(
        "label",
        { class: "check" },
        box,
        el("span", { class: "box", "aria-hidden": "true", text: "✔" }),
        el("span", { class: "check-text", text: label }),
    );
}

/** Radio-like group of buttons. Returns the element with `.value` and `.onChange`. */
export function segmented(options, { value, onChange, label } = {}) {
    let current = value ?? (typeof options[0] === "string" ? options[0] : options[0].value);
    const group = el("div", { class: "segmented", role: "group", "aria-label": label ?? "Options" });
    const buttons = options.map((option) => {
        const { value: optionValue, label: optionLabel } =
            typeof option === "string" ? { value: option, label: option } : option;
        const node = el("button", {
            type: "button",
            "aria-pressed": String(optionValue === current),
            text: optionLabel,
            onClick: () => {
                current = optionValue;
                buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === current)));
                group.value = current;
                onChange?.(current);
            },
        });
        node.dataset.value = optionValue;
        return node;
    });
    append(group, buttons);
    group.value = current;
    return group;
}

/* --- Status / feedback --------------------------------------------------- */

const STATUS_GLYPHS = { error: "⚠", success: "✓", warning: "⚠", info: "•" };

export function statusBox() {
    const glyph = el("span", { class: "status-glyph", "aria-hidden": "true" });
    const text = el("span");
    const detail = el("span", { class: "status-detail" });
    const node = el("div", { class: "status", hidden: true }, glyph, el("span", {}, text, detail));

    node.show = (type, message, detailText = "") => {
        node.className = `status status-${type}`;
        glyph.textContent = STATUS_GLYPHS[type] ?? "•";
        text.textContent = message;
        detail.textContent = detailText;
        node.hidden = false;
    };
    node.error = (message, detailText) => node.show("error", message, detailText);
    node.success = (message, detailText) => node.show("success", message, detailText);
    node.warn = (message, detailText) => node.show("warning", message, detailText);
    node.reset = () => {
        node.hidden = true;
        text.textContent = "";
        detail.textContent = "";
    };
    return node;
}

export function emptyState(title, description, glyph = "∅") {
    return el(
        "div",
        { class: "empty-state" },
        el("div", { class: "empty-glyph", "aria-hidden": "true", text: glyph }),
        el("strong", { text: title }),
        description ? el("p", { class: "small", text: description }) : null,
    );
}

/* --- Panels -------------------------------------------------------------- */

export function panel({ title, meta, actions } = {}, ...children) {
    const head = title || meta || actions
        ? el(
            "div",
            { class: "panel-head" },
            title ? el("span", { class: "panel-title", text: title }) : null,
            meta ?? null,
            actions ? el("div", { class: "btn-row", style: { marginLeft: "auto" } }, ...actions) : null,
        )
        : null;
    return el("section", { class: "panel" }, head, ...children);
}

export function metaLabel(text = "") {
    return el("span", { class: "panel-meta", text });
}

export function codeOutput(placeholder = "Output will appear here") {
    const node = el("pre", { class: "code-out", tabindex: "0", "data-placeholder": placeholder });
    node.setValue = (value) => { node.textContent = value ?? ""; };
    node.getValue = () => node.textContent ?? "";
    return node;
}

export function keyValueList(pairs) {
    const list = el("dl", { class: "kv" });
    for (const [key, value] of pairs) {
        list.append(
            el("dt", { text: key }),
            el("dd", { class: "wrap-anywhere" }, value instanceof Node ? value : el("span", { text: String(value) })),
        );
    }
    return list;
}

export function dataTable(headers, rows) {
    return el(
        "div",
        { class: "table-wrap" },
        el(
            "table",
            { class: "data" },
            el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", { text: h })))),
            el(
                "tbody",
                {},
                ...rows.map((row) => el("tr", {}, ...row.map((cell) =>
                    cell instanceof Node
                        ? el("td", {}, cell)
                        : el("td", { class: "mono", text: String(cell) })))),
            ),
        ),
    );
}

/* --- Character counter --------------------------------------------------- */

export function countMeta(source) {
    const node = metaLabel("");
    const update = () => {
        const value = source.value ?? "";
        const lines = value === "" ? 0 : value.split("\n").length;
        node.textContent = `${formatNumber(value.length)} chars · ${formatNumber(lines)} lines · ${formatNumber(byteLength(value))} bytes`;
    };
    source.addEventListener("input", update);
    update();
    return node;
}

/* --- Input/output scaffold ----------------------------------------------- */

/**
 * Builds the standard "paste → transform → copy" layout used by most tools.
 * Returns an object exposing the created nodes plus small helpers.
 */
export function createIO({
    inputLabel = "Input",
    inputPlaceholder = "Paste your text here…",
    inputSize = "",
    outputLabel = "Output",
    outputPlaceholder = "Output will appear here",
    actions = [],
    downloadName = "output.txt",
    downloadMime,
    stacked = false,
    onInput,
    onRun,
} = {}) {
    const inputEl = textarea({ placeholder: inputPlaceholder, size: inputSize, "aria-label": inputLabel });
    const outputEl = codeOutput(outputPlaceholder);
    const status = statusBox();

    const actionRow = el("div", { class: "btn-row" });
    for (const action of actions) {
        actionRow.append(button(action.label, {
            variant: action.primary ? "primary" : action.variant ?? "",
            glyph: action.glyph,
            onClick: action.onClick,
        }));
    }
    actionRow.append(
        el("span", { class: "spacer" }),
        button("Clear", {
            variant: "danger",
            glyph: "⌫",
            onClick: () => {
                inputEl.value = "";
                outputEl.setValue("");
                status.reset();
                inputEl.dispatchEvent(new Event("input"));
                inputEl.focus();
            },
        }),
    );

    const inputPanel = panel(
        { title: inputLabel, meta: countMeta(inputEl) },
        inputEl,
        actionRow,
    );

    const outputMeta = metaLabel("");
    const outputPanel = panel(
        {
            title: outputLabel,
            meta: outputMeta,
            actions: [
                copyButton(() => outputEl.getValue(), { small: true }),
                downloadButton(() => outputEl.getValue(), downloadName, { small: true, mime: downloadMime }),
            ],
        },
        outputEl,
    );

    const grid = el("div", { class: stacked ? "tool-body" : "io-grid" }, inputPanel, outputPanel);
    const node = el("div", { class: "tool-body" }, status, grid);

    const setOutput = (value) => {
        outputEl.setValue(value);
        outputMeta.textContent = value
            ? `${formatNumber(value.length)} chars · ${formatNumber(byteLength(value))} bytes`
            : "";
    };

    if (onInput) inputEl.addEventListener("input", () => onInput(inputEl.value));
    if (onRun) {
        inputEl.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                onRun();
            }
        });
    }

    return { node, input: inputEl, output: outputEl, status, setOutput, actionRow, inputPanel, outputPanel };
}

/* --- Form helper --------------------------------------------------------- */

/**
 * Creates a labelled control grid. `spec` items: { key, label, type, ... }.
 * Returns { node, values(), controls, onChange(fn) }.
 */
export function formGrid(spec, { columns = "auto", onChange } = {}) {
    const controls = {};
    const node = el("div", { class: "form-grid" });
    if (columns !== "auto") node.style.gridTemplateColumns = columns;

    for (const item of spec) {
        let control;
        if (item.type === "select") {
            control = select(item.options, { value: item.value });
        } else if (item.type === "textarea") {
            control = textarea({ placeholder: item.placeholder ?? "", size: item.size ?? "sm", value: item.value ?? "" });
        } else if (item.type === "checkbox") {
            control = checkbox(item.label, { checked: Boolean(item.value) });
        } else {
            control = input({
                type: item.type ?? "text",
                placeholder: item.placeholder ?? "",
                value: item.value ?? "",
                min: item.min,
                max: item.max,
                step: item.step,
            });
        }

        controls[item.key] = control;
        const wrapper = item.type === "checkbox"
            ? el("div", { class: "field" }, control)
            : field(item.label, control, { hint: item.hint });
        if (item.span === 2) wrapper.classList.add("span-2");
        node.append(wrapper);
    }

    const values = () => {
        const result = {};
        for (const [key, control] of Object.entries(controls)) {
            const element = control.querySelector?.("input[type=checkbox]") ?? control;
            result[key] = element.type === "checkbox" ? element.checked : element.value;
        }
        return result;
    };

    if (onChange) {
        node.addEventListener("input", () => onChange(values()));
        node.addEventListener("change", () => onChange(values()));
    }

    return { node, values, controls };
}
