"use strict";

import {
    el, panel, input, field, checkbox, segmented, codeOutput, copyButton, statusBox,
    textarea, dataTable, button, keyValueList, countMeta, metaLabel, toast,
} from "../ui.js";
import { randomInt, shuffle, formatNumber, toLines, copyToClipboard } from "../utils.js";

/* ========================================================================== */
/* Password generator                                                         */
/* ========================================================================== */

const CHARSETS = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};
const AMBIGUOUS = "Il1O0o|`'\"{}[]()/\\";

const WORDS = `able acid acorn agent album alert alien alley amber anchor angle ankle apple arbor arch arrow asset atlas
atom aura author axis bacon badge bagel baker balcony bamboo banjo barge basil batch beach beacon beam bean bear beast
bench berry birch bison blade blaze bliss bloom board bonus boost booth borax bottle bounce brain branch brave bread
breeze brick bridge brisk broom brush bubble bucket buffer bundle butter cabin cable cactus camel candle canyon carbon
cargo carpet castle cedar cell chalk charm cheese cherry chess chime cider cinder circle citrus clay cliff cloud clover
coast cobalt cocoa comet coral cosmic cotton coyote crane crater crayon creek crest crisp crown crystal cube curve
cyber cycle daisy dance dawn debug delta denim depot desert diamond digit dingo dock dolphin domain donut dove draft
dragon dream drift drum dune eagle earth easel ebony echo eclipse edge elder ember emerald engine epoch equal ethic
evergreen exile fabric falcon fancy feather fern fiber fiddle field filter finch fjord flame flask fleet flint flora
flute focus foggy forest fossil fountain fox frame frost fuel fusion gadget galaxy garden garlic gate gauge gecko
gem ginger glacier glass glide globe glow gopher grain granite graph gravel green grid grove guitar gulf habit hail
hammer harbor harvest hawk hazel heather hedge helix hermit hickory hill hollow honey horizon hotel hunter husky ice
icon igloo index indigo inlet ivory jade jasmine jetty jewel jungle juniper kayak kernel kettle key kiln kite koala
lagoon lamp lantern larch laser lattice lava layer leaf ledge legend lemon lentil level lever lichen lilac lime linen
lion liquid lobby locust lodge lotus lunar lynx magnet mango maple marble marsh meadow melon mercy meteor mint mirror
modem module monsoon moss motto mountain mural nectar needle neon nest nickel noble nomad north nova nugget oak oasis
ocean olive onyx opal orbit orchard organ otter oxide oyster paddle palm panda pantry paper parade parcel pastel patio
pearl pebble pepper petal phoenix piano picnic pigment pillar pine pixel planet plaza plum pocket polar pollen pond
poplar poppy portal potion powder prairie prism prize puma pulse pumpkin puzzle quartz quest quilt quiver radar radish
rain ranch rapid raven ravine realm reed reef relay ribbon ridge rifle river robin rocket rodeo roof rose rover ruby
rudder rugby runner rustic saffron sage sail salmon sand sapphire satin scout script sculpt seal season sedge sequoia
shadow shale shard shell shield shore signal silk silver siren sketch slate sled slope smoke snow socket solar solid
sonnet spark sphere spice spiral spring sprout spruce square stable stack staff stage stamp star steam steel stone
storm stream studio summit sunset surf swamp swan sweep symbol syntax syrup table talon tango tapir teal temple tender
thistle thorn thread thunder tide tiger timber tinder token tonic topaz torch totem tower trace track trail trench
tribe trout truffle trumpet tulip tundra tunnel turbo turtle twig ultra umbra unity urban vale valley vapor vault
velvet venture vertex vessel vine violet vista vocal vortex voyage walnut walrus wander warden wasp water wave weave
wedge whale wharf wheat whisk widget willow window winter wisp wolf wombat wonder woods wrench yarn yeast yield yonder
zebra zenith zephyr zinc zodiac zone`
    .split(/\s+/)
    .filter((word) => /^[a-z]{3,9}$/.test(word));

function estimateEntropy(password) {
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
    if (pool === 0) return 0;
    return password.length * Math.log2(pool);
}

function crackTime(entropyBits) {
    // 10^11 guesses/second is a reasonable offline attack assumption for fast hashes.
    const seconds = 2 ** (entropyBits - 1) / 1e11;
    const units = [
        ["centuries", 3155760000],
        ["years", 31557600],
        ["months", 2629800],
        ["days", 86400],
        ["hours", 3600],
        ["minutes", 60],
        ["seconds", 1],
    ];
    if (seconds < 1) return "less than a second";
    for (const [name, size] of units) {
        if (seconds >= size) {
            const value = seconds / size;
            return value > 1e6 ? `${value.toExponential(2)} ${name}` : `${formatNumber(Math.round(value))} ${name}`;
        }
    }
    return "unknown";
}

export function passwordGenerator(host) {
    let mode = "random";
    const length = input({ type: "number", value: "20", min: "4", max: "128" });
    const count = input({ type: "number", value: "5", min: "1", max: "50" });
    const wordCount = input({ type: "number", value: "4", min: "3", max: "12" });
    const output = codeOutput("Generated passwords appear here");
    const status = statusBox();
    const meta = metaLabel("");

    const options = { lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false, capitalize: true, addNumber: true };
    let separator = "-";

    function buildPool() {
        let pool = "";
        for (const key of ["lower", "upper", "digits", "symbols"]) {
            if (options[key]) pool += CHARSETS[key];
        }
        if (options.excludeAmbiguous) {
            pool = [...pool].filter((char) => !AMBIGUOUS.includes(char)).join("");
        }
        return pool;
    }

    function randomPassword() {
        const pool = buildPool();
        const size = Math.max(4, Math.min(Number(length.value) || 20, 128));
        const required = [];
        for (const key of ["lower", "upper", "digits", "symbols"]) {
            if (!options[key]) continue;
            const set = options.excludeAmbiguous
                ? [...CHARSETS[key]].filter((char) => !AMBIGUOUS.includes(char))
                : [...CHARSETS[key]];
            if (set.length) required.push(set[randomInt(set.length)]);
        }
        const rest = Array.from({ length: Math.max(size - required.length, 0) }, () => pool[randomInt(pool.length)]);
        return shuffle([...required, ...rest]).join("").slice(0, size);
    }

    function passphrase() {
        const size = Math.max(3, Math.min(Number(wordCount.value) || 4, 12));
        const words = Array.from({ length: size }, () => WORDS[randomInt(WORDS.length)]);
        const shaped = options.capitalize ? words.map((word) => word[0].toUpperCase() + word.slice(1)) : words;
        if (options.addNumber) shaped.push(String(randomInt(90) + 10));
        return shaped.join(separator);
    }

    function generate() {
        status.reset();
        if (mode === "random" && !buildPool()) {
            output.setValue("");
            status.error("Select at least one character set");
            return;
        }
        const total = Math.max(1, Math.min(Number(count.value) || 1, 50));
        const list = Array.from({ length: total }, () => (mode === "random" ? randomPassword() : passphrase()));
        output.setValue(list.join("\n"));

        const bits = mode === "random"
            ? (Number(length.value) || 20) * Math.log2(buildPool().length)
            : Math.max(3, Number(wordCount.value) || 4) * Math.log2(WORDS.length) + (options.addNumber ? Math.log2(90) : 0);
        meta.textContent = `≈ ${Math.round(bits)} bits of entropy`;
        status.success(`${total} generated`, `Offline crack time: ${crackTime(bits)}`);
    }

    const toggle = (label, key) => checkbox(label, {
        checked: options[key],
        onChange: (checked) => { options[key] = checked; generate(); },
    });

    const randomOptions = el(
        "div",
        { class: "tool-body" },
        el("div", { class: "inline-row" }, field("Length", length), field("How many", count)),
        el(
            "div",
            { class: "check-grid" },
            toggle("Lowercase a-z", "lower"),
            toggle("Uppercase A-Z", "upper"),
            toggle("Digits 0-9", "digits"),
            toggle("Symbols", "symbols"),
            toggle("Exclude look-alike characters", "excludeAmbiguous"),
        ),
    );

    const phraseOptions = el(
        "div",
        { class: "tool-body" },
        el("div", { class: "inline-row" }, field("Words", wordCount), field("How many", count)),
        el(
            "div",
            { class: "inline-row" },
            segmented(
                [{ value: "-", label: "Hyphen" }, { value: ".", label: "Dot" }, { value: "_", label: "Underscore" }, { value: " ", label: "Space" }],
                { value: separator, label: "Separator", onChange: (value) => { separator = value; generate(); } },
            ),
        ),
        el(
            "div",
            { class: "check-grid" },
            toggle("Capitalise words", "capitalize"),
            toggle("Append a number", "addNumber"),
        ),
    );

    phraseOptions.hidden = true;

    const modeSwitch = segmented(
        [{ value: "random", label: "Random characters" }, { value: "passphrase", label: "Passphrase" }],
        {
            value: mode,
            label: "Password style",
            onChange: (value) => {
                mode = value;
                randomOptions.hidden = value !== "random";
                phraseOptions.hidden = value !== "passphrase";
                generate();
            },
        },
    );

    for (const control of [length, count, wordCount]) control.addEventListener("input", generate);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Style" }, modeSwitch, randomOptions, phraseOptions),
        status,
        panel(
            {
                title: "Passwords",
                meta,
                actions: [
                    button("Regenerate", { variant: "primary", glyph: "↻", small: true, onClick: generate }),
                    copyButton(() => output.getValue(), { label: "Copy all", small: true }),
                ],
            },
            output,
        ),
        el("p", {
            class: "small muted",
            text: "Generated with crypto.getRandomValues() in your browser. Nothing is transmitted, logged or stored.",
        }),
    ));

    generate();
}

/* ========================================================================== */
/* Password strength                                                          */
/* ========================================================================== */

const COMMON_PATTERNS = [
    [/^(?:password|passwd|admin|welcome|letmein|qwerty|iloveyou|dragon|monkey|football)/i, "Starts with a very common password"],
    [/(.)\1{2,}/, "Contains a character repeated three or more times"],
    [/(?:012|123|234|345|456|567|678|789|890)/, "Contains a numeric sequence"],
    [/(?:abc|bcd|cde|def|qwe|wer|ert|asd|sdf|zxc)/i, "Contains a keyboard or alphabet sequence"],
    [/^\d+$/, "Digits only"],
    [/^[a-z]+$/, "Lowercase letters only"],
    [/(?:19|20)\d{2}/, "Contains something that looks like a year"],
];

export function passwordStrength(host) {
    const passwordInput = input({ type: "password", placeholder: "Type a password to analyse", autocomplete: "new-password" });
    const meter = el("div", { class: "strength-meter" }, ...Array.from({ length: 4 }, () => el("span")));
    const resultHost = el("div", {});
    const status = statusBox();
    let visible = false;

    function render() {
        const value = passwordInput.value;
        status.reset();
        resultHost.replaceChildren();
        for (const bar of meter.children) bar.className = "";

        if (!value) {
            resultHost.append(el("p", { class: "small muted", text: "Nothing is sent anywhere — analysis happens in this tab." }));
            return;
        }

        let bits = estimateEntropy(value);
        const issues = COMMON_PATTERNS.filter(([pattern]) => pattern.test(value)).map(([, message]) => message);
        bits = Math.max(bits - issues.length * 8, 4);

        const level = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
        const names = ["", "Weak", "Fair", "Good", "Strong"];
        const classes = ["", "on-weak", "on-fair", "on-good", "on-strong"];
        for (let i = 0; i < level; i += 1) meter.children[i].className = classes[level];

        resultHost.append(keyValueList([
            ["Rating", names[level]],
            ["Estimated entropy", `${Math.round(bits)} bits`],
            ["Length", formatNumber(value.length)],
            ["Character sets", [
                /[a-z]/.test(value) && "lowercase",
                /[A-Z]/.test(value) && "uppercase",
                /\d/.test(value) && "digits",
                /[^a-zA-Z0-9]/.test(value) && "symbols",
            ].filter(Boolean).join(", ") || "none"],
            ["Offline crack time", crackTime(bits)],
        ]));

        if (issues.length) {
            resultHost.append(el(
                "ul",
                { class: "small", style: { margin: "12px 0 0", paddingLeft: "20px", color: "var(--warning)" } },
                ...issues.map((issue) => el("li", { text: issue })),
            ));
        }

        if (level <= 2) status.warn(`${names[level]} password`, "Use more length — length beats complexity.");
        else status.success(`${names[level]} password`);
    }

    passwordInput.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Password" },
            field("Password", passwordInput),
            meter,
            el("div", { class: "btn-row" }, button("Show password", {
                glyph: "◉",
                small: true,
                onClick: (event) => {
                    visible = !visible;
                    passwordInput.type = visible ? "text" : "password";
                    event.currentTarget.lastChild.textContent = visible ? "Hide password" : "Show password";
                },
            })),
        ),
        status,
        panel({ title: "Analysis" }, resultHost),
        el("p", {
            class: "small muted",
            text: "This estimate is heuristic. It is not stored, autocompleted or sent to any server.",
        }),
    ));

    render();
    passwordInput.focus();
}

/* ========================================================================== */
/* Secret detector                                                            */
/* ========================================================================== */

const SECRET_RULES = [
    ["AWS access key ID", /\b(?:AKIA|ASIA|AIDA|AROA)[0-9A-Z]{16}\b/g, "critical"],
    ["AWS secret access key", /\b(?:aws)?_?secret_?(?:access)?_?key\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, "critical"],
    ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, "critical"],
    ["GitLab token", /\bglpat-[A-Za-z0-9_-]{20,}\b/g, "critical"],
    ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, "critical"],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g, "critical"],
    ["Stripe key", /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{10,}\b/g, "critical"],
    ["Private key block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, "critical"],
    ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "warning"],
    ["Basic auth in URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi, "critical"],
    ["Generic password assignment", /\b(?:password|passwd|pwd)\s*[=:]\s*["']([^"'\s]{6,})["']/gi, "warning"],
    ["Generic secret assignment", /\b(?:secret|token|api_?key|access_?key|auth)\w*\s*[=:]\s*["']([^"'\s]{12,})["']/gi, "warning"],
    ["Slack webhook", /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, "critical"],
    ["Connection string with password", /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:]+:[^\s@]+@/gi, "critical"],
];

const mask = (value) => (value.length <= 8 ? "•".repeat(value.length) : `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`);

export function secretDetector(host) {
    const source = textarea({
        placeholder: "Paste configuration, logs or code to scan for credentials…",
        size: "lg",
        "aria-label": "Text to scan",
    });
    const status = statusBox();
    const resultHost = el("div", {});

    function scan() {
        status.reset();
        resultHost.replaceChildren();
        const text = source.value;
        if (!text.trim()) {
            resultHost.append(el("p", { class: "small muted", text: "Findings appear here. The text never leaves your browser." }));
            return;
        }

        const lines = toLines(text);
        const findings = [];
        for (const [name, pattern, severity] of SECRET_RULES) {
            pattern.lastIndex = 0;
            let match = pattern.exec(text);
            while (match) {
                const index = match.index;
                const line = text.slice(0, index).split("\n").length;
                findings.push({
                    name,
                    severity,
                    line,
                    value: mask(match[1] ?? match[0]),
                    context: (lines[line - 1] ?? "").trim().slice(0, 60),
                });
                if (match[0] === "") pattern.lastIndex += 1;
                match = pattern.exec(text);
            }
        }

        if (!findings.length) {
            status.success("No known secret patterns found", "This is a heuristic scan — it cannot prove the text is safe.");
            resultHost.append(el("p", { class: "small muted", text: "No matches." }));
            return;
        }

        const critical = findings.filter((finding) => finding.severity === "critical").length;
        status.error(
            `${formatNumber(findings.length)} potential secret${findings.length === 1 ? "" : "s"} found`,
            critical ? `${critical} look like live credentials — rotate them if they were ever committed.` : "",
        );

        resultHost.append(dataTable(
            ["Type", "Line", "Masked value", "Context"],
            findings.slice(0, 200).map((finding) => [
                el("span", {
                    class: `badge ${finding.severity === "critical" ? "badge-danger" : "badge-warning"}`,
                    text: finding.name,
                }),
                String(finding.line),
                finding.value,
                el("span", { class: "small muted", text: finding.context }),
            ]),
        ));
    }

    source.addEventListener("input", scan);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Text to scan", meta: countMeta(source) }, source),
        status,
        panel({ title: "Findings" }, resultHost),
        el("p", {
            class: "small muted",
            text: "Matched values are masked before being displayed. Nothing is uploaded, and pasted text is never stored.",
        }),
    ));

    scan();
    source.focus();
}

/* ========================================================================== */
/* PEM formatter                                                              */
/* ========================================================================== */

const PEM_LINE = 64;

export function pemFormatter(host) {
    const source = textarea({
        placeholder: "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----",
        size: "lg",
        "aria-label": "PEM block",
    });
    const labelInput = input({ placeholder: "CERTIFICATE", value: "CERTIFICATE" });
    const output = codeOutput("The re-wrapped PEM block appears here");
    const status = statusBox();

    function run() {
        status.reset();
        const text = source.value.trim();
        if (!text) {
            output.setValue("");
            return;
        }

        const headerMatch = /-----BEGIN ([A-Z0-9 ]+)-----/.exec(text);
        const label = headerMatch ? headerMatch[1] : (labelInput.value.trim().toUpperCase() || "CERTIFICATE");
        const body = text
            .replace(/-----BEGIN [A-Z0-9 ]+-----/g, "")
            .replace(/-----END [A-Z0-9 ]+-----/g, "")
            .replace(/\s+/g, "");

        if (!body) {
            output.setValue("");
            status.error("No Base64 content found");
            return;
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
            output.setValue("");
            status.error("The body contains characters that are not valid Base64");
            return;
        }

        const wrapped = body.match(new RegExp(`.{1,${PEM_LINE}}`, "g")).join("\n");
        output.setValue(`-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`);

        let bytes = 0;
        try {
            bytes = atob(body).length;
            status.success(`${label} · ${formatNumber(bytes)} bytes`, `${formatNumber(wrapped.split("\n").length)} lines of 64 characters`);
        } catch {
            status.warn("Re-wrapped, but the Base64 payload could not be decoded", "Check that no characters are missing.");
        }
    }

    for (const control of [source, labelInput]) control.addEventListener("input", run);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "PEM input", meta: countMeta(source) }, source),
        panel(
            { title: "Options" },
            field("Label to use when none is present", labelInput, { hint: "CERTIFICATE, PUBLIC KEY, RSA PRIVATE KEY…" }),
            el("div", { class: "btn-row" }, button("Strip to single line", {
                glyph: "⇥",
                small: true,
                onClick: async () => {
                    const body = output.getValue().replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
                    const ok = await copyToClipboard(body);
                    toast(ok ? "Single-line body copied" : "Nothing to copy", ok ? "success" : "warning");
                },
            })),
        ),
        status,
        panel({ title: "Formatted", actions: [copyButton(() => output.getValue(), { small: true })] }, output),
        el("p", {
            class: "small muted",
            text: "Private key material pasted here stays in memory only. Nothing is stored or transmitted.",
        }),
    ));

    run();
    source.focus();
}
