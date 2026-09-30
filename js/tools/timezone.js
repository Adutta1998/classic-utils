"use strict";

import {
    el, panel, field, input, select, statusBox, button, copyButton, keyValueList, iconButton, toast,
} from "../ui.js";
import { getPref, setPref } from "../storage.js";
import { pad2, debounce } from "../utils.js";

const TOOL_ID = "timezone-converter";

const FALLBACK_ZONES = [
    "UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "America/Sao_Paulo", "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris",
    "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Stockholm",
    "Europe/Warsaw", "Europe/Athens", "Europe/Istanbul", "Europe/Moscow", "Africa/Lagos",
    "Africa/Cairo", "Africa/Johannesburg", "Africa/Nairobi", "Asia/Jerusalem", "Asia/Dubai",
    "Asia/Karachi", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Bangkok",
    "Asia/Jakarta", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Seoul",
    "Asia/Tokyo", "Australia/Perth", "Australia/Adelaide", "Australia/Brisbane",
    "Australia/Sydney", "Pacific/Auckland", "Pacific/Honolulu",
];

const DEFAULT_TARGETS = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"];

function availableZones() {
    try {
        const zones = Intl.supportedValuesOf?.("timeZone");
        if (Array.isArray(zones) && zones.length) return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
    } catch {
        /* fall through to the bundled list */
    }
    return FALLBACK_ZONES;
}

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Browsers canonicalise zone names (Asia/Kolkata → Asia/Calcutta), so match on both forms. */
function resolveZone(zone, zones) {
    let canonical = null;
    try {
        canonical = new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
    } catch {
        return null;
    }
    if (zones.includes(canonical)) return canonical;
    if (zones.includes(zone)) return zone;
    return null;
}

/** Offset of `timeZone` from UTC, in milliseconds, at the given instant. */
export function zoneOffset(instantMs, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
    );
    return asUtc - instantMs;
}

/** Converts a wall-clock time in `timeZone` into the matching UTC instant. */
export function wallTimeToInstant(year, month, day, hour, minute, timeZone) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const firstOffset = zoneOffset(guess, timeZone);
    let instant = guess - firstOffset;
    const secondOffset = zoneOffset(instant, timeZone);
    if (secondOffset !== firstOffset) instant = guess - secondOffset;
    return instant;
}

function formatOffset(offsetMs) {
    const totalMinutes = Math.round(offsetMs / 60000);
    const sign = totalMinutes < 0 ? "-" : "+";
    const absolute = Math.abs(totalMinutes);
    return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

function formatDifference(offsetMs) {
    const totalMinutes = Math.round(offsetMs / 60000);
    if (totalMinutes === 0) return "same time";
    const sign = totalMinutes > 0 ? "+" : "−";
    const absolute = Math.abs(totalMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${sign}${hours}h${minutes ? ` ${minutes}m` : ""}`;
}

function zoneAbbreviation(date, timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(date);
        return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    } catch {
        return "";
    }
}

const zoneParts = (date, timeZone) => Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
);

const calendarDay = (parts) => `${parts.year}-${parts.month}-${parts.day}`;

export function timezoneConverter(host) {
    const zones = availableZones();
    const home = localZone();

    const stored = getPref(TOOL_ID, "targets", null);
    const wanted = Array.isArray(stored) && stored.length ? stored : [home, ...DEFAULT_TARGETS];
    const targets = [];
    for (const zone of wanted) {
        const resolved = resolveZone(zone, zones);
        if (resolved && !targets.includes(resolved)) targets.push(resolved);
    }

    const whenInput = input({ type: "datetime-local" });
    const sourceSelect = select(zones.includes(home) ? zones : [home, ...zones], { value: home });
    const addSelect = select(zones, { value: resolveZone("Europe/Berlin", zones) ?? zones[0] });
    const status = statusBox();
    const rowsHost = el("div", { class: "tool-body" });
    const instantHost = el("div", {});
    let copyText = "";

    function setNow() {
        const parts = zoneParts(new Date(), sourceSelect.value);
        whenInput.value = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    }

    function currentInstant() {
        const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(whenInput.value);
        if (!match) return null;
        const [, year, month, day, hour, minute] = match.map(Number);
        return wallTimeToInstant(year, month, day, hour, minute, sourceSelect.value);
    }

    function render() {
        status.reset();
        rowsHost.replaceChildren();
        instantHost.replaceChildren();

        const instant = currentInstant();
        if (instant === null || Number.isNaN(instant)) {
            copyText = "";
            rowsHost.append(el("p", { class: "small muted", text: "Pick a date and time to convert." }));
            return;
        }

        const date = new Date(instant);
        const sourceOffset = zoneOffset(instant, sourceSelect.value);
        const sourceDay = calendarDay(zoneParts(date, sourceSelect.value));

        instantHost.append(keyValueList([
            ["ISO 8601 (UTC)", date.toISOString()],
            ["Unix seconds", String(Math.floor(instant / 1000))],
            ["Source offset", formatOffset(sourceOffset)],
        ]));

        if (!targets.length) {
            rowsHost.append(el("p", { class: "small muted", text: "Add a time zone to compare against." }));
        }

        const lines = [];
        for (const zone of targets) {
            const offset = zoneOffset(instant, zone);
            const parts = zoneParts(date, zone);
            const hour = Number(parts.hour);
            const formatted = new Intl.DateTimeFormat(undefined, {
                timeZone: zone, dateStyle: "medium", timeStyle: "short",
            }).format(date);

            const dayShift = calendarDay(parts) === sourceDay
                ? ""
                : calendarDay(parts) > sourceDay ? "next day" : "previous day";

            const isWorkHours = hour >= 9 && hour < 18;
            lines.push(`${zone}: ${formatted} (${formatOffset(offset)})`);

            rowsHost.append(panel(
                {
                    title: zone.replace(/_/g, " "),
                    meta: el("span", { class: "panel-meta", text: formatDifference(offset - sourceOffset) }),
                    actions: [
                        iconButton("✕", {
                            label: `Remove ${zone}`,
                            onClick: () => {
                                targets.splice(targets.indexOf(zone), 1);
                                setPref(TOOL_ID, "targets", targets);
                                render();
                            },
                        }),
                    ],
                },
                el("p", { class: "mono", text: formatted }),
                el(
                    "div",
                    { class: "btn-row" },
                    el("span", { class: "badge", text: formatOffset(offset) }),
                    zoneAbbreviation(date, zone)
                        ? el("span", { class: "badge", text: zoneAbbreviation(date, zone) })
                        : null,
                    el("span", {
                        class: `badge ${isWorkHours ? "badge-success" : "badge-warning"}`,
                        text: isWorkHours ? "Working hours" : "Outside 09:00–18:00",
                    }),
                    dayShift ? el("span", { class: "badge badge-accent", text: dayShift }) : null,
                ),
            ));
        }

        copyText = [`${sourceSelect.value}: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: sourceSelect.value }).format(date)}`, ...lines].join("\n");
        status.success(`Converted to ${targets.length} time zone${targets.length === 1 ? "" : "s"}`);
    }

    const debouncedRender = debounce(render, 60);
    whenInput.addEventListener("input", debouncedRender);
    sourceSelect.addEventListener("change", render);

    function addZone() {
        const zone = addSelect.value;
        if (targets.includes(zone)) {
            toast("That time zone is already in the list", "warning");
            return;
        }
        targets.push(zone);
        setPref(TOOL_ID, "targets", targets);
        render();
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Source time" },
            el(
                "div",
                { class: "form-grid" },
                field("Date and time", whenInput),
                field("In this time zone", sourceSelect),
            ),
            el(
                "div",
                { class: "btn-row" },
                button("Now", { variant: "primary", glyph: "⏱", onClick: () => { setNow(); render(); } }),
                button("Use my time zone", {
                    glyph: "⌂",
                    onClick: () => {
                        sourceSelect.value = home;
                        render();
                    },
                }),
            ),
            el("p", { class: "small muted", text: `Your device reports ${home}.` }),
        ),
        panel(
            { title: "Compare with" },
            el(
                "div",
                { class: "inline-row" },
                field("Time zone", addSelect),
                button("Add", { variant: "primary", glyph: "+", onClick: addZone }),
            ),
        ),
        status,
        rowsHost,
        panel({ title: "Instant", actions: [copyButton(() => copyText, { small: true })] }, instantHost),
        el("p", {
            class: "small muted",
            text: "Conversions use the IANA time zone database built into your browser, so daylight saving transitions are handled for you.",
        }),
    ));

    setNow();
    render();
}
