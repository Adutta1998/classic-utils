"use strict";

import { el, panel, input, field, statusBox, keyValueList, dataTable, copyButton } from "../ui.js";
import { pad2, toLocalIso } from "../utils.js";

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

const MACROS = {
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
    "@monthly": "0 0 1 * *",
    "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@hourly": "0 * * * *",
};

const FIELDS = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day of month", min: 1, max: 31 },
    { name: "month", min: 1, max: 12, names: MONTH_NAMES },
    { name: "day of week", min: 0, max: 6, names: DAY_NAMES },
];

function parseField(raw, spec) {
    const values = new Set();
    const text = raw.trim();
    if (!text) throw new Error(`Empty ${spec.name} field`);

    for (const part of text.split(",")) {
        const [rangePart, stepPart] = part.split("/");
        const step = stepPart === undefined ? 1 : Number(stepPart);
        if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid step "/${stepPart}" in ${spec.name}`);

        let start;
        let end;
        if (rangePart === "*" || rangePart === "?") {
            start = spec.min;
            end = spec.max;
        } else if (rangePart.includes("-")) {
            const [from, to] = rangePart.split("-");
            start = toNumber(from, spec);
            end = toNumber(to, spec);
        } else {
            start = toNumber(rangePart, spec);
            end = stepPart === undefined ? start : spec.max;
        }

        if (start > end) throw new Error(`Range ${rangePart} is reversed in ${spec.name}`);
        for (let value = start; value <= end; value += step) values.add(value);
    }
    return values;
}

function toNumber(token, spec) {
    const text = token.trim().toUpperCase();
    if (spec.names) {
        const index = spec.names.indexOf(text);
        if (index !== -1) return spec.min === 1 ? index + 1 : index;
    }
    const value = Number(text);
    if (!Number.isInteger(value)) throw new Error(`"${token}" is not valid in the ${spec.name} field`);
    if (spec.name === "day of week" && value === 7) return 0;
    if (value < spec.min || value > spec.max) {
        throw new Error(`${value} is outside ${spec.min}–${spec.max} in the ${spec.name} field`);
    }
    return value;
}

export function parseCron(expression) {
    const normalized = MACROS[expression.trim().toLowerCase()] ?? expression.trim();
    const parts = normalized.split(/\s+/);
    if (parts.length !== 5) {
        throw new Error(`Expected 5 fields (minute hour day-of-month month day-of-week) but found ${parts.length}`);
    }
    const sets = FIELDS.map((spec, index) => parseField(parts[index], spec));
    return {
        fields: parts,
        minutes: sets[0],
        hours: sets[1],
        daysOfMonth: sets[2],
        months: sets[3],
        daysOfWeek: sets[4],
        domRestricted: parts[2] !== "*" && parts[2] !== "?",
        dowRestricted: parts[4] !== "*" && parts[4] !== "?",
    };
}

function listToText(values, total, formatter = String) {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === total) return "every";
    if (sorted.length > 6) return `${sorted.length} selected values`;
    return sorted.map(formatter).join(", ");
}

export function describeCron(cron) {
    const [minuteField, hourField, domField, monthField, dowField] = cron.fields;

    let time;
    if (minuteField === "*" && hourField === "*") time = "Every minute";
    else if (hourField === "*") time = `At minute ${listToText(cron.minutes, 60)} of every hour`;
    else if (minuteField === "*") time = `Every minute during hour ${listToText(cron.hours, 24)}`;
    else {
        const times = [];
        for (const hour of [...cron.hours].sort((a, b) => a - b)) {
            for (const minute of [...cron.minutes].sort((a, b) => a - b)) {
                times.push(`${pad2(hour)}:${pad2(minute)}`);
            }
        }
        time = times.length <= 8 ? `At ${times.join(", ")}` : `At ${times.length} times per day`;
    }

    const parts = [time];
    if (cron.domRestricted) parts.push(`on day ${listToText(cron.daysOfMonth, 31)} of the month`);
    if (cron.dowRestricted) parts.push(`on ${listToText(cron.daysOfWeek, 7, (d) => DAY_LONG[d])}`);
    if (monthField !== "*") parts.push(`in ${listToText(cron.months, 12, (m) => MONTH_LONG[m - 1])}`);
    return `${parts.join(" ")}.`;
}

function matchesDay(cron, date) {
    if (!cron.months.has(date.getMonth() + 1)) return false;
    const domMatch = cron.daysOfMonth.has(date.getDate());
    const dowMatch = cron.daysOfWeek.has(date.getDay());
    if (cron.domRestricted && cron.dowRestricted) return domMatch || dowMatch;
    if (cron.domRestricted) return domMatch;
    if (cron.dowRestricted) return dowMatch;
    return true;
}

/** Next `count` local run times, searching up to five years ahead. */
export function nextRuns(cron, from = new Date(), count = 5) {
    const runs = [];
    const cursor = new Date(from.getTime());
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);

    const hours = [...cron.hours].sort((a, b) => a - b);
    const minutes = [...cron.minutes].sort((a, b) => a - b);

    for (let day = 0; day < 1830 && runs.length < count; day += 1) {
        const probe = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + day);
        if (!matchesDay(cron, probe)) continue;
        for (const hour of hours) {
            for (const minute of minutes) {
                const candidate = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate(), hour, minute);
                if (candidate >= cursor) {
                    runs.push(candidate);
                    if (runs.length >= count) return runs;
                }
            }
        }
    }
    return runs;
}

export function cronHelper(host) {
    const expressionInput = input({ placeholder: "*/15 9-17 * * MON-FRI", value: "*/15 9-17 * * MON-FRI" });
    const status = statusBox();
    const summaryHost = el("div", {});
    const runsHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        summaryHost.replaceChildren();
        runsHost.replaceChildren();
        const text = expressionInput.value.trim();
        if (!text) {
            copyText = "";
            summaryHost.append(el("p", { class: "small muted", text: "Enter a cron expression." }));
            return;
        }
        try {
            const cron = parseCron(text);
            const description = describeCron(cron);
            summaryHost.append(keyValueList([
                ["Expression", cron.fields.join(" ")],
                ["Minute", cron.fields[0]],
                ["Hour", cron.fields[1]],
                ["Day of month", cron.fields[2]],
                ["Month", cron.fields[3]],
                ["Day of week", cron.fields[4]],
                ["Meaning", description],
            ]));
            const runs = nextRuns(cron);
            if (runs.length) {
                runsHost.append(dataTable(
                    ["#", "Local time", "ISO 8601"],
                    runs.map((date, index) => [String(index + 1), date.toLocaleString(), toLocalIso(date)]),
                ));
            } else {
                runsHost.append(el("p", { class: "small muted", text: "No runs scheduled in the next five years." }));
            }
            copyText = `${cron.fields.join(" ")}\n${description}\n\n${runs.map(toLocalIso).join("\n")}`;
            status.success(description);
        } catch (error) {
            copyText = "";
            status.error("Invalid cron expression", error.message);
        }
    }

    expressionInput.addEventListener("input", render);

    const presets = el(
        "div",
        { class: "btn-row" },
        ...Object.entries({
            "Every minute": "* * * * *",
            "Every 5 minutes": "*/5 * * * *",
            Hourly: "0 * * * *",
            "Daily 02:30": "30 2 * * *",
            Weekdays: "0 9 * * MON-FRI",
            Monthly: "0 0 1 * *",
        }).map(([label, value]) => el("button", {
            class: "btn btn-sm",
            type: "button",
            text: label,
            onClick: () => {
                expressionInput.value = value;
                render();
            },
        })),
    );

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Cron expression" },
            field("Five fields: minute hour day-of-month month day-of-week", expressionInput, {
                hint: "Supports *, ranges, lists, steps, month and weekday names, and @daily style macros.",
            }),
            presets,
        ),
        status,
        panel({ title: "Breakdown", actions: [copyButton(() => copyText, { small: true })] }, summaryHost),
        panel({ title: "Next 5 runs (local time)" }, runsHost),
    ));

    render();
}
