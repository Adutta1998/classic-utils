"use strict";

import {
    el, panel, input, field, select, statusBox, keyValueList, segmented, copyButton, dataTable, checkbox, button,
} from "../ui.js";
import { formatNumber, formatBytes, debounce, toLocalIso, relativeTime, pad2 } from "../utils.js";

const num = (control, fallback = 0) => {
    const value = Number.parseFloat(control.value);
    return Number.isFinite(value) ? value : fallback;
};

const round = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
};

/* ========================================================================== */
/* Percentage                                                                 */
/* ========================================================================== */

export function percentageCalculator(host) {
    let mode = "of";
    const a = input({ type: "number", value: "25", step: "any" });
    const b = input({ type: "number", value: "200", step: "any" });
    const status = statusBox();
    const resultHost = el("div", {});
    const labelA = el("span", { class: "field-label" });
    const labelB = el("span", { class: "field-label" });
    let copyText = "";

    const MODES = {
        of: { a: "Percentage (%)", b: "Of value" },
        is: { a: "Value", b: "Out of" },
        change: { a: "From", b: "To" },
        increase: { a: "Value", b: "Increase by (%)" },
        decrease: { a: "Value", b: "Decrease by (%)" },
    };

    function render() {
        status.reset();
        resultHost.replaceChildren();
        labelA.textContent = MODES[mode].a;
        labelB.textContent = MODES[mode].b;

        const x = num(a);
        const y = num(b);
        let rows;

        if (mode === "of") {
            rows = [[`${x}% of ${y}`, String(round((x / 100) * y, 6))]];
        } else if (mode === "is") {
            if (y === 0) {
                rows = null;
                status.error("Cannot divide by zero");
            } else {
                rows = [[`${x} out of ${y}`, `${round((x / y) * 100, 6)}%`]];
            }
        } else if (mode === "change") {
            if (x === 0) {
                rows = null;
                status.error("Cannot compute a change from zero");
            } else {
                const change = ((y - x) / Math.abs(x)) * 100;
                rows = [
                    ["Difference", String(round(y - x, 6))],
                    ["Change", `${round(change, 4)}%`],
                    ["Direction", change > 0 ? "Increase" : change < 0 ? "Decrease" : "No change"],
                ];
            }
        } else if (mode === "increase") {
            rows = [["Result", String(round(x * (1 + y / 100), 6))], ["Added", String(round((x * y) / 100, 6))]];
        } else {
            rows = [["Result", String(round(x * (1 - y / 100), 6))], ["Removed", String(round((x * y) / 100, 6))]];
        }

        if (!rows) {
            copyText = "";
            return;
        }
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
    }

    for (const control of [a, b]) control.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Calculation" },
            segmented(
                [
                    { value: "of", label: "X% of Y" },
                    { value: "is", label: "X is what % of Y" },
                    { value: "change", label: "% change" },
                    { value: "increase", label: "Increase by %" },
                    { value: "decrease", label: "Decrease by %" },
                ],
                { value: mode, label: "Mode", onChange: (value) => { mode = value; render(); } },
            ),
            el(
                "div",
                { class: "form-grid" },
                el("div", { class: "field" }, labelA, a),
                el("div", { class: "field" }, labelB, b),
            ),
        ),
        status,
        panel({ title: "Result", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
    a.focus();
}

/* ========================================================================== */
/* EMI                                                                        */
/* ========================================================================== */

export function emiCalculator(host) {
    const principal = input({ type: "number", value: "500000", min: "0", step: "any" });
    const rate = input({ type: "number", value: "9.5", min: "0", step: "any" });
    const years = input({ type: "number", value: "5", min: "0", step: "any" });
    const status = statusBox();
    const resultHost = el("div", {});
    const scheduleHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        scheduleHost.replaceChildren();

        const p = num(principal);
        const annualRate = num(rate);
        const term = num(years);

        if (p <= 0 || term <= 0) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Enter a loan amount and tenure." }));
            return;
        }

        const months = Math.round(term * 12);
        const monthlyRate = annualRate / 12 / 100;
        const emi = monthlyRate === 0
            ? p / months
            : (p * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
        const total = emi * months;

        const rows = [
            ["Monthly EMI", formatNumber(round(emi))],
            ["Number of payments", formatNumber(months)],
            ["Total payable", formatNumber(round(total))],
            ["Total interest", formatNumber(round(total - p))],
            ["Interest as % of principal", `${round(((total - p) / p) * 100, 2)}%`],
        ];
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));

        let balance = p;
        const yearly = [];
        for (let year = 1; year <= Math.ceil(months / 12); year += 1) {
            let interestPaid = 0;
            let principalPaid = 0;
            for (let month = 0; month < 12 && (year - 1) * 12 + month < months; month += 1) {
                const interest = balance * monthlyRate;
                const principalPart = emi - interest;
                interestPaid += interest;
                principalPaid += principalPart;
                balance -= principalPart;
            }
            yearly.push([
                String(year),
                formatNumber(round(principalPaid)),
                formatNumber(round(interestPaid)),
                formatNumber(round(Math.max(balance, 0))),
            ]);
        }
        scheduleHost.append(dataTable(["Year", "Principal paid", "Interest paid", "Balance"], yearly));
        status.success(`EMI ${formatNumber(round(emi))} per month for ${formatNumber(months)} months`);
    }

    for (const control of [principal, rate, years]) control.addEventListener("input", debounce(render, 60));

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Loan" },
            el(
                "div",
                { class: "form-grid" },
                field("Principal", principal),
                field("Annual interest rate (%)", rate),
                field("Tenure (years)", years),
            ),
        ),
        status,
        panel({ title: "Summary", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
        panel({ title: "Yearly breakdown" }, scheduleHost),
        el("p", { class: "small muted", text: "Uses the standard reducing-balance EMI formula. Fees and taxes are not included." }),
    ));

    render();
}

/* ========================================================================== */
/* Age                                                                        */
/* ========================================================================== */

const toDateValue = (date) => date.toISOString().slice(0, 10);

export function ageCalculator(host) {
    const birth = input({ type: "date", value: "1995-06-15" });
    const reference = input({ type: "date", value: toDateValue(new Date()) });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const start = new Date(birth.value);
        const end = new Date(reference.value);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Pick both dates." }));
            return;
        }
        if (end < start) {
            copyText = "";
            status.error("The reference date is before the date of birth");
            return;
        }

        let years = end.getFullYear() - start.getFullYear();
        let months = end.getMonth() - start.getMonth();
        let days = end.getDate() - start.getDate();
        if (days < 0) {
            months -= 1;
            days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
        }
        if (months < 0) {
            years -= 1;
            months += 12;
        }

        const totalDays = Math.floor((end - start) / 86400000);
        const nextBirthday = new Date(end.getFullYear(), start.getMonth(), start.getDate());
        if (nextBirthday < end) nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);

        const rows = [
            ["Age", `${years} years, ${months} months, ${days} days`],
            ["Total months", formatNumber(years * 12 + months)],
            ["Total weeks", formatNumber(Math.floor(totalDays / 7))],
            ["Total days", formatNumber(totalDays)],
            ["Total hours", formatNumber(totalDays * 24)],
            ["Next birthday", nextBirthday.toLocaleDateString(undefined, { dateStyle: "full" })],
            ["Days until next birthday", formatNumber(Math.ceil((nextBirthday - end) / 86400000))],
            ["Born on a", start.toLocaleDateString(undefined, { weekday: "long" })],
        ];
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success(`${years} years old`);
    }

    for (const control of [birth, reference]) control.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Dates" },
            el("div", { class: "form-grid" }, field("Date of birth", birth), field("Age on", reference)),
        ),
        status,
        panel({ title: "Result", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
}

/* ========================================================================== */
/* Date difference                                                            */
/* ========================================================================== */

export function dateDifference(host) {
    const start = input({ type: "date", value: toDateValue(new Date()) });
    const end = input({ type: "date", value: toDateValue(new Date(Date.now() + 30 * 86400000)) });
    const offsetDays = input({ type: "number", value: "0", step: "1" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function businessDays(from, to) {
        let count = 0;
        const cursor = new Date(from);
        while (cursor < to) {
            const day = cursor.getDay();
            if (day !== 0 && day !== 6) count += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
        return count;
    }

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const from = new Date(start.value);
        const to = new Date(end.value);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Pick both dates." }));
            return;
        }

        const totalDays = Math.round((to - from) / 86400000);
        const shifted = new Date(from);
        shifted.setDate(shifted.getDate() + (Number.parseInt(offsetDays.value, 10) || 0));

        const rows = [
            ["Days between", formatNumber(Math.abs(totalDays))],
            ["Weeks", String(round(Math.abs(totalDays) / 7, 2))],
            ["Business days", formatNumber(businessDays(totalDays >= 0 ? from : to, totalDays >= 0 ? to : from))],
            ["Weekend days", formatNumber(Math.abs(totalDays) - businessDays(totalDays >= 0 ? from : to, totalDays >= 0 ? to : from))],
            ["Direction", totalDays === 0 ? "Same day" : totalDays > 0 ? "End is later" : "End is earlier"],
            ["Start weekday", from.toLocaleDateString(undefined, { weekday: "long" })],
            ["End weekday", to.toLocaleDateString(undefined, { weekday: "long" })],
            ["Start date + offset", shifted.toLocaleDateString(undefined, { dateStyle: "full" })],
        ];
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success(`${formatNumber(Math.abs(totalDays))} days apart`);
    }

    for (const control of [start, end, offsetDays]) control.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Dates" },
            el(
                "div",
                { class: "form-grid" },
                field("Start date", start),
                field("End date", end),
                field("Add days to start", offsetDays, { hint: "Negative values subtract" }),
            ),
        ),
        status,
        panel({ title: "Result", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
}

/* ========================================================================== */
/* Date add / subtract                                                        */
/* ========================================================================== */

const toDateTimeValue = (date) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** Moves `date` by `count` working days, skipping Saturdays and Sundays. */
function shiftBusinessDays(date, count) {
    const result = new Date(date);
    const step = count >= 0 ? 1 : -1;
    let remaining = Math.abs(count);
    while (remaining > 0) {
        result.setDate(result.getDate() + step);
        const day = result.getDay();
        if (day !== 0 && day !== 6) remaining -= 1;
    }
    return result;
}

export function dateAddSubtract(host) {
    const start = input({ type: "datetime-local", value: toDateTimeValue(new Date()) });
    const amounts = {
        years: input({ type: "number", value: "0", step: "1" }),
        months: input({ type: "number", value: "0", step: "1" }),
        weeks: input({ type: "number", value: "0", step: "1" }),
        days: input({ type: "number", value: "30", step: "1" }),
        hours: input({ type: "number", value: "0", step: "1" }),
        minutes: input({ type: "number", value: "0", step: "1" }),
    };
    const status = statusBox();
    const resultHost = el("div", {});
    let operation = "add";
    let businessDaysOnly = false;
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();

        const base = new Date(start.value);
        if (Number.isNaN(base.getTime())) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Pick a starting date and time." }));
            return;
        }

        const sign = operation === "add" ? 1 : -1;
        const parts = Object.fromEntries(
            Object.entries(amounts).map(([unit, control]) => [unit, (Number.parseInt(control.value, 10) || 0) * sign]),
        );

        let result = new Date(base);
        result.setFullYear(result.getFullYear() + parts.years);
        result.setMonth(result.getMonth() + parts.months);
        result.setDate(result.getDate() + parts.weeks * 7);
        if (businessDaysOnly && parts.days !== 0) result = shiftBusinessDays(result, parts.days);
        else result.setDate(result.getDate() + parts.days);
        result.setHours(result.getHours() + parts.hours);
        result.setMinutes(result.getMinutes() + parts.minutes);

        if (Number.isNaN(result.getTime())) {
            copyText = "";
            status.error("That shift produces a date outside the supported range");
            return;
        }

        const diffMs = result.getTime() - base.getTime();
        const diffDays = diffMs / 86400000;
        const fromNow = result.getTime() - Date.now();

        const summary = Object.entries(parts)
            .filter(([, value]) => value !== 0)
            .map(([unit, value]) => `${Math.abs(value)} ${Math.abs(value) === 1 ? unit.slice(0, -1) : unit}`)
            .join(", ") || "nothing";

        const rows = [
            ["Result", result.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })],
            ["ISO 8601 (local)", toLocalIso(result)],
            ["ISO 8601 (UTC)", result.toISOString()],
            ["Date only", `${result.getFullYear()}-${pad2(result.getMonth() + 1)}-${pad2(result.getDate())}`],
            ["Weekday", result.toLocaleDateString(undefined, { weekday: "long" })],
            ["Unix seconds", String(Math.floor(result.getTime() / 1000))],
            ["Shift applied", `${operation === "add" ? "+" : "−"} ${summary}${businessDaysOnly ? " (days counted as business days)" : ""}`],
            ["Total change", `${formatNumber(round(Math.abs(diffDays), 4))} days`],
            ["Relative to now", relativeTime(result)],
            ["Days from today", formatNumber(Math.round(fromNow / 86400000))],
        ];

        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success(result.toLocaleDateString(undefined, { dateStyle: "long" }));
    }

    const debounced = debounce(render, 60);
    for (const control of [start, ...Object.values(amounts)]) control.addEventListener("input", debounced);

    const quick = el(
        "div",
        { class: "btn-row" },
        ...[
            ["Tomorrow", { days: 1 }],
            ["+1 week", { weeks: 1 }],
            ["+30 days", { days: 30 }],
            ["+90 days", { days: 90 }],
            ["+6 months", { months: 6 }],
            ["+1 year", { years: 1 }],
        ].map(([label, preset]) => button(label, {
            small: true,
            onClick: () => {
                for (const control of Object.values(amounts)) control.value = "0";
                for (const [unit, value] of Object.entries(preset)) amounts[unit].value = String(value);
                render();
            },
        })),
    );

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Starting point" },
            el(
                "div",
                { class: "inline-row" },
                field("Date and time", start),
                button("Now", {
                    glyph: "⏱",
                    onClick: () => {
                        start.value = toDateTimeValue(new Date());
                        render();
                    },
                }),
            ),
        ),
        panel(
            { title: "Shift" },
            segmented(
                [{ value: "add", label: "Add" }, { value: "subtract", label: "Subtract" }],
                { value: operation, label: "Direction", onChange: (value) => { operation = value; render(); } },
            ),
            el(
                "div",
                { class: "form-grid tight" },
                field("Years", amounts.years),
                field("Months", amounts.months),
                field("Weeks", amounts.weeks),
                field("Days", amounts.days),
                field("Hours", amounts.hours),
                field("Minutes", amounts.minutes),
            ),
            checkbox("Count days as business days (skip weekends)", {
                onChange: (checked) => { businessDaysOnly = checked; render(); },
            }),
            quick,
        ),
        status,
        panel({ title: "Result", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
        el("p", {
            class: "small muted",
            text: "Months and years are calendar-aware: adding one month to 31 January lands in March, matching how JavaScript and most calendars behave.",
        }),
    ));

    render();
}

/* ========================================================================== */
/* Time duration                                                              */
/* ========================================================================== */

export function timeDuration(host) {
    const durationInput = input({ placeholder: "1h 30m 15s, 90m or 01:30:15", value: "1h 30m" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function parseDuration(text) {
        const trimmed = text.trim();
        if (!trimmed) return null;

        if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(trimmed)) {
            const parts = trimmed.split(":").map(Number);
            const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
            return h * 3600 + m * 60 + s;
        }

        const pattern = /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi;
        const factors = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
        let total = 0;
        let matched = false;
        let match = pattern.exec(trimmed);
        while (match) {
            matched = true;
            total += Number(match[1]) * factors[match[2][0].toLowerCase()];
            match = pattern.exec(trimmed);
        }
        if (matched) return total;
        if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
        throw new Error('Try formats like "1h 30m", "90m", "2d 4h" or "01:30:15".');
    }

    function render() {
        status.reset();
        resultHost.replaceChildren();
        try {
            const seconds = parseDuration(durationInput.value);
            if (seconds === null) {
                copyText = "";
                resultHost.append(el("p", { class: "small muted", text: "Enter a duration." }));
                return;
            }
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = round(seconds % 60, 3);

            const rows = [
                ["Normalised", [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, secs && `${secs}s`]
                    .filter(Boolean).join(" ") || "0s"],
                ["Clock format", `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(Math.floor(secs)).padStart(2, "0")}`],
                ["Total seconds", formatNumber(round(seconds, 3))],
                ["Total minutes", formatNumber(round(seconds / 60, 4))],
                ["Total hours", formatNumber(round(seconds / 3600, 4))],
                ["Total days", formatNumber(round(seconds / 86400, 6))],
                ["ISO 8601 duration", `P${days ? `${days}D` : ""}T${hours}H${minutes}M${Math.floor(secs)}S`],
                ["Milliseconds", formatNumber(Math.round(seconds * 1000))],
            ];
            copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
            resultHost.append(keyValueList(rows));
            status.success("Parsed");
        } catch (error) {
            copyText = "";
            status.error("Could not read that duration", error.message);
        }
    }

    durationInput.addEventListener("input", debounce(render, 60));

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Duration" }, field("Enter a duration", durationInput, { hint: "Mix units freely: 2d 4h 30m" })),
        status,
        panel({ title: "Converted", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
    durationInput.focus();
}

/* ========================================================================== */
/* Data size                                                                  */
/* ========================================================================== */

const SIZE_UNITS = {
    B: 1,
    KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4, PB: 1000 ** 5,
    KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, PiB: 1024 ** 5,
    bit: 1 / 8, Kbit: 1000 / 8, Mbit: 1000 ** 2 / 8, Gbit: 1000 ** 3 / 8,
};

export function dataSizeConverter(host) {
    const amount = input({ type: "number", value: "1", step: "any" });
    const unit = select(Object.keys(SIZE_UNITS), { value: "GiB" });
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        resultHost.replaceChildren();
        const bytes = num(amount) * SIZE_UNITS[unit.value];
        const rows = Object.keys(SIZE_UNITS).map((name) => {
            const value = bytes / SIZE_UNITS[name];
            return [name, value >= 1e-4 && value < 1e15 ? formatNumber(round(value, 6)) : value.toExponential(4)];
        });
        rows.unshift(["Human readable", formatBytes(bytes)]);
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
    }

    for (const control of [amount, unit]) {
        control.addEventListener("input", render);
        control.addEventListener("change", render);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Amount" },
            el("div", { class: "form-grid" }, field("Value", amount), field("Unit", unit)),
        ),
        panel({ title: "Converted", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
        el("p", {
            class: "small muted",
            text: "KB/MB/GB are decimal (1000-based). KiB/MiB/GiB are binary (1024-based). Disk vendors use decimal units; operating systems usually report binary.",
        }),
    ));

    render();
}

/* ========================================================================== */
/* Bandwidth                                                                  */
/* ========================================================================== */

export function bandwidthCalculator(host) {
    const size = input({ type: "number", value: "5", step: "any" });
    const sizeUnit = select(["MB", "GB", "TB", "MiB", "GiB", "TiB"], { value: "GB" });
    const speed = input({ type: "number", value: "100", step: "any" });
    const speedUnit = select(["Kbps", "Mbps", "Gbps", "MB/s", "MiB/s"], { value: "Mbps" });
    const efficiency = input({ type: "number", value: "100", min: "1", max: "100" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    const SIZE_FACTORS = { MB: 1e6, GB: 1e9, TB: 1e12, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
    const SPEED_FACTORS = { Kbps: 1e3 / 8, Mbps: 1e6 / 8, Gbps: 1e9 / 8, "MB/s": 1e6, "MiB/s": 1024 ** 2 };

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const bytes = num(size) * SIZE_FACTORS[sizeUnit.value];
        const bytesPerSecond = num(speed) * SPEED_FACTORS[speedUnit.value] * (num(efficiency, 100) / 100);

        if (bytes <= 0 || bytesPerSecond <= 0) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Enter a file size and a link speed." }));
            return;
        }

        const seconds = bytes / bytesPerSecond;
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const rows = [
            ["Transfer time", [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${secs}s`]
                .filter(Boolean).join(" ")],
            ["Total seconds", formatNumber(round(seconds, 2))],
            ["Effective throughput", `${formatBytes(bytesPerSecond)}/s`],
            ["File size", formatBytes(bytes)],
            ["Data per hour", formatBytes(bytesPerSecond * 3600)],
            ["Data per day", formatBytes(bytesPerSecond * 86400)],
        ];
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success(`About ${round(seconds, 1)} seconds at ${num(efficiency, 100)}% efficiency`);
    }

    for (const control of [size, sizeUnit, speed, speedUnit, efficiency]) {
        control.addEventListener("input", render);
        control.addEventListener("change", render);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Transfer" },
            el(
                "div",
                { class: "form-grid" },
                field("File size", size),
                field("Size unit", sizeUnit),
                field("Link speed", speed),
                field("Speed unit", speedUnit),
                field("Link efficiency (%)", efficiency, { hint: "Real links rarely reach 100%" }),
            ),
        ),
        status,
        panel({ title: "Result", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
}

/* ========================================================================== */
/* Unit converter                                                             */
/* ========================================================================== */

const UNIT_GROUPS = {
    Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, "nautical mile": 1852 },
    Weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, stone: 6.35029318 },
    Area: { "m²": 1, "km²": 1e6, "cm²": 1e-4, hectare: 1e4, acre: 4046.8564224, "ft²": 0.09290304, "mi²": 2589988.110336 },
    Volume: { L: 1, mL: 0.001, "m³": 1000, "gal (US)": 3.785411784, "gal (UK)": 4.54609, "cup (US)": 0.2365882365, "fl oz (US)": 0.0295735295625 },
    Speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444, "ft/s": 0.3048 },
    Pressure: { Pa: 1, kPa: 1000, bar: 100000, psi: 6894.757293168, atm: 101325, mmHg: 133.322387415 },
};

const TEMPERATURES = {
    "°C": { toBase: (v) => v, fromBase: (v) => v },
    "°F": { toBase: (v) => (v - 32) / 1.8, fromBase: (v) => v * 1.8 + 32 },
    K: { toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
};

export function unitConverter(host) {
    const groupSelect = select([...Object.keys(UNIT_GROUPS), "Temperature"], { value: "Length" });
    const amount = input({ type: "number", value: "1", step: "any" });
    const fromSelect = select(Object.keys(UNIT_GROUPS.Length), { value: "m" });
    const resultHost = el("div", {});
    let copyText = "";

    function units() {
        return groupSelect.value === "Temperature" ? Object.keys(TEMPERATURES) : Object.keys(UNIT_GROUPS[groupSelect.value]);
    }

    function rebuildUnits() {
        const list = units();
        fromSelect.replaceChildren();
        for (const name of list) fromSelect.append(el("option", { value: name, text: name }));
        fromSelect.value = list[0];
        render();
    }

    function render() {
        resultHost.replaceChildren();
        const value = num(amount);
        const list = units();

        const rows = list.map((name) => {
            let converted;
            if (groupSelect.value === "Temperature") {
                converted = TEMPERATURES[name].fromBase(TEMPERATURES[fromSelect.value].toBase(value));
            } else {
                const factors = UNIT_GROUPS[groupSelect.value];
                converted = (value * factors[fromSelect.value]) / factors[name];
            }
            const display = Math.abs(converted) >= 1e-6 && Math.abs(converted) < 1e12
                ? formatNumber(round(converted, 6))
                : converted.toExponential(4);
            return [name, display];
        });

        copyText = rows.map(([key, val]) => `${value} ${fromSelect.value} = ${val} ${key}`).join("\n");
        resultHost.append(keyValueList(rows));
    }

    groupSelect.addEventListener("change", rebuildUnits);
    amount.addEventListener("input", render);
    fromSelect.addEventListener("change", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Convert" },
            el(
                "div",
                { class: "form-grid" },
                field("Category", groupSelect),
                field("Value", amount),
                field("From unit", fromSelect),
            ),
        ),
        panel({ title: "Equivalents", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));

    render();
}
