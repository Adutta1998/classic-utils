"use strict";

import { createIO, el, panel, segmented, checkbox, keyValueList } from "../ui.js";
import { base64Decode, base64Encode } from "../utils.js";

/* ========================================================================== */
/* Base64                                                                     */
/* ========================================================================== */

export function base64Tool(host) {
    let mode = "encode";
    let urlSafe = false;

    const io = createIO({
        inputLabel: "Input",
        inputPlaceholder: "Text to encode, or Base64 to decode…",
        outputLabel: "Result",
        outputPlaceholder: "Result appears here",
        downloadName: "base64.txt",
        actions: [{ label: "Convert", glyph: "⇄", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        const text = io.input.value;
        io.status.reset();
        if (!text.trim()) {
            io.setOutput("");
            return;
        }
        try {
            if (mode === "encode") {
                let encoded = base64Encode(text);
                if (urlSafe) encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                io.setOutput(encoded);
                io.status.success("Encoded");
            } else {
                let normalized = text.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
                while (normalized.length % 4 !== 0) normalized += "=";
                io.setOutput(base64Decode(normalized));
                io.status.success("Decoded");
            }
        } catch {
            io.setOutput("");
            io.status.error("That is not valid Base64", "Check for stray characters or truncated padding.");
        }
    }

    const options = panel(
        { title: "Mode" },
        segmented(
            [
                { value: "encode", label: "Text → Base64" },
                { value: "decode", label: "Base64 → Text" },
            ],
            { value: mode, label: "Direction", onChange: (value) => { mode = value; run(); } },
        ),
        checkbox("URL-safe alphabet (-, _, no padding)", {
            checked: urlSafe,
            onChange: (checked) => { urlSafe = checked; run(); },
        }),
        el("p", { class: "small muted", text: "Encoding is Unicode-safe — emoji and non-Latin scripts round-trip correctly." }),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}

/* ========================================================================== */
/* URL encoding                                                               */
/* ========================================================================== */

export function urlTool(host) {
    let mode = "encode";
    let component = true;

    const partsPanel = panel({ title: "Parsed URL" }, el("p", { class: "small muted", text: "Paste a full URL to see its parts." }));

    const io = createIO({
        inputLabel: "Input",
        inputPlaceholder: "https://example.com/search?q=hello world&lang=en",
        outputLabel: "Result",
        outputPlaceholder: "Result appears here",
        downloadName: "url.txt",
        actions: [{ label: "Convert", glyph: "⇄", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function renderParts(text) {
        partsPanel.replaceChildren(el("span", { class: "panel-title", text: "Parsed URL" }));
        let url;
        try {
            url = new URL(text.trim());
        } catch {
            partsPanel.append(el("p", { class: "small muted", text: "Paste a full URL to see its parts." }));
            return;
        }
        const pairs = [
            ["Protocol", url.protocol.replace(":", "")],
            ["Host", url.host],
            ["Path", url.pathname],
            ["Hash", url.hash || "—"],
        ];
        const query = Array.from(url.searchParams.entries());
        partsPanel.append(keyValueList(pairs));
        if (query.length) {
            partsPanel.append(
                el("span", { class: "panel-title", text: "Query parameters" }),
                keyValueList(query.map(([key, value]) => [key, value === "" ? "(empty)" : value])),
            );
        }
    }

    function run() {
        const text = io.input.value;
        io.status.reset();
        if (!text.trim()) {
            io.setOutput("");
            renderParts("");
            return;
        }
        try {
            const encoder = component ? encodeURIComponent : encodeURI;
            const decoder = component ? decodeURIComponent : decodeURI;
            io.setOutput(mode === "encode" ? encoder(text) : decoder(text));
            io.status.success(mode === "encode" ? "Encoded" : "Decoded");
        } catch {
            io.setOutput("");
            io.status.error("Could not decode", "The input contains an invalid percent-escape sequence.");
        }
        renderParts(mode === "encode" ? text : io.output.getValue());
    }

    const options = panel(
        { title: "Mode" },
        segmented(
            [
                { value: "encode", label: "Encode" },
                { value: "decode", label: "Decode" },
            ],
            { value: mode, label: "Direction", onChange: (value) => { mode = value; run(); } },
        ),
        checkbox("Encode component (escapes & ? = / :)", {
            checked: component,
            onChange: (checked) => { component = checked; run(); },
        }),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node, partsPanel));
    io.input.focus();
}

/* ========================================================================== */
/* Hex ⇄ text                                                                 */
/* ========================================================================== */

export function hexTool(host) {
    let mode = "encode";
    let separator = " ";
    let uppercase = false;

    const io = createIO({
        inputLabel: "Input",
        inputPlaceholder: "Text to convert, or hex bytes such as 48 65 6c 6c 6f",
        outputLabel: "Result",
        outputPlaceholder: "Result appears here",
        downloadName: "hex.txt",
        actions: [{ label: "Convert", glyph: "⇄", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        const text = io.input.value;
        io.status.reset();
        if (!text.trim()) {
            io.setOutput("");
            return;
        }
        if (mode === "encode") {
            const bytes = new TextEncoder().encode(text);
            let hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(separator);
            if (uppercase) hex = hex.toUpperCase();
            io.setOutput(hex);
            io.status.success(`${bytes.length} bytes`);
            return;
        }
        const cleaned = text.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
        if (!cleaned) {
            io.setOutput("");
            io.status.error("No hex digits found");
            return;
        }
        if (cleaned.length % 2 !== 0) {
            io.setOutput("");
            io.status.error("Odd number of hex digits", "Each byte needs exactly two hex characters.");
            return;
        }
        const bytes = new Uint8Array(cleaned.length / 2);
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(cleaned.substr(i * 2, 2), 16);
        io.setOutput(new TextDecoder().decode(bytes));
        io.status.success(`${bytes.length} bytes decoded`);
    }

    const options = panel(
        { title: "Mode" },
        segmented(
            [
                { value: "encode", label: "Text → Hex" },
                { value: "decode", label: "Hex → Text" },
            ],
            { value: mode, label: "Direction", onChange: (value) => { mode = value; run(); } },
        ),
        el(
            "div",
            { class: "inline-row" },
            segmented(
                [
                    { value: " ", label: "Spaced" },
                    { value: "", label: "Continuous" },
                    { value: ":", label: "Colons" },
                ],
                { value: separator, label: "Separator", onChange: (value) => { separator = value; run(); } },
            ),
            checkbox("Uppercase", { checked: uppercase, onChange: (checked) => { uppercase = checked; run(); } }),
        ),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}
