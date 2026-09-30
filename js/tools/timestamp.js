"use strict";

import { el, panel, input, field, button, keyValueList, statusBox, copyButton, select } from "../ui.js";
import { pad2, relativeTime, toLocalIso } from "../utils.js";

function parseInput(raw, unit) {
    const text = raw.trim();
    if (!text) return null;

    if (/^-?\d+$/.test(text)) {
        const value = Number(text);
        if (unit === "ms") return new Date(value);
        if (unit === "s") return new Date(value * 1000);
        // Auto: 13+ digits is milliseconds, 10 digits is seconds.
        return new Date(Math.abs(value) >= 1e11 ? value : value * 1000);
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcString(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ` +
        `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} UTC`;
}

export function timestampConverter(host) {
    const valueInput = input({ placeholder: "1767225600, 1767225600000 or 2026-01-01T00:00:00Z" });
    const unitSelect = select(
        [
            { value: "auto", label: "Auto-detect" },
            { value: "s", label: "Unix seconds" },
            { value: "ms", label: "Unix milliseconds" },
        ],
        { value: "auto" },
    );
    const status = statusBox();
    const resultHost = el("div", {});
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";

    let lastText = "";

    function render() {
        const date = parseInput(valueInput.value, unitSelect.value);
        status.reset();
        resultHost.replaceChildren();

        if (!valueInput.value.trim()) {
            lastText = "";
            resultHost.append(el("p", { class: "small muted", text: "Enter a timestamp or date to convert." }));
            return;
        }
        if (!date || Number.isNaN(date.getTime())) {
            lastText = "";
            status.error("Could not read that value", "Try Unix seconds, milliseconds or an ISO 8601 date.");
            return;
        }

        const rows = [
            ["Unix (seconds)", String(Math.floor(date.getTime() / 1000))],
            ["Unix (milliseconds)", String(date.getTime())],
            ["ISO 8601 (UTC)", date.toISOString()],
            ["UTC", utcString(date)],
            [`Local (${timezone})`, date.toLocaleString()],
            ["Local ISO", toLocalIso(date)],
            ["Relative", relativeTime(date)],
            ["Day of week", date.toLocaleDateString(undefined, { weekday: "long" })],
        ];
        lastText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success("Converted");
    }

    valueInput.addEventListener("input", render);
    unitSelect.addEventListener("change", render);

    const nowButton = button("Use current time", {
        variant: "primary",
        glyph: "⏱",
        onClick: () => {
            valueInput.value = String(Math.floor(Date.now() / 1000));
            unitSelect.value = "s";
            render();
        },
    });

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Input" },
            el(
                "div",
                { class: "form-grid" },
                field("Timestamp or date", valueInput),
                field("Interpret numbers as", unitSelect),
            ),
            el("div", { class: "btn-row" }, nowButton, button("Start of today (local)", {
                glyph: "📅",
                onClick: () => {
                    const start = new Date();
                    start.setHours(0, 0, 0, 0);
                    valueInput.value = String(start.getTime());
                    unitSelect.value = "ms";
                    render();
                },
            })),
        ),
        status,
        panel(
            { title: "Converted", actions: [copyButton(() => lastText, { small: true })] },
            resultHost,
        ),
    ));

    valueInput.value = String(Math.floor(Date.now() / 1000));
    render();
    valueInput.focus();
}
