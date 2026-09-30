"use strict";

import {
    el, panel, field, input, segmented, statusBox, button,
    copyButton, keyValueList, formGrid, toast,
} from "../ui.js";
import { encodeQr, qrToSvg } from "../lib/qrcode.js";
import { copyToClipboard, downloadText, clamp, debounce } from "../utils.js";

const ECC_LEVELS = [
    { value: "L", label: "L · 7%" },
    { value: "M", label: "M · 15%" },
    { value: "Q", label: "Q · 25%" },
    { value: "H", label: "H · 30%" },
];

/** Escapes the reserved characters of the WIFI: payload format. */
const escapeWifi = (value) => String(value).replace(/([\\;,:"])/g, "\\$1");

const CONTENT_TYPES = {
    Text: {
        fields: [{ key: "text", label: "Text", type: "textarea", span: 2, placeholder: "Anything you want to encode" }],
        build: (v) => v.text ?? "",
    },
    URL: {
        fields: [{ key: "url", label: "Address", span: 2, placeholder: "https://example.com", value: "https://example.com" }],
        build: (v) => {
            const url = (v.url ?? "").trim();
            if (!url) return "";
            return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
        },
    },
    "Wi-Fi": {
        fields: [
            { key: "ssid", label: "Network name (SSID)", placeholder: "HomeNetwork" },
            { key: "security", label: "Security", type: "select", options: ["WPA", "WEP", "nopass"], value: "WPA" },
            { key: "password", label: "Password", placeholder: "Never stored or sent" },
            { key: "hidden", label: "Hidden network", type: "checkbox" },
        ],
        build: (v) => {
            if (!v.ssid) return "";
            const parts = [`T:${v.security}`, `S:${escapeWifi(v.ssid)}`];
            if (v.security !== "nopass" && v.password) parts.push(`P:${escapeWifi(v.password)}`);
            if (v.hidden) parts.push("H:true");
            return `WIFI:${parts.join(";")};;`;
        },
    },
    Email: {
        fields: [
            { key: "to", label: "To", placeholder: "hello@example.com" },
            { key: "subject", label: "Subject", placeholder: "Hello" },
            { key: "body", label: "Message", type: "textarea", span: 2, placeholder: "Body text" },
        ],
        build: (v) => {
            if (!v.to) return "";
            const query = [
                v.subject && `subject=${encodeURIComponent(v.subject)}`,
                v.body && `body=${encodeURIComponent(v.body)}`,
            ].filter(Boolean).join("&");
            return `mailto:${v.to.trim()}${query ? `?${query}` : ""}`;
        },
    },
    SMS: {
        fields: [
            { key: "number", label: "Phone number", placeholder: "+911234567890" },
            { key: "message", label: "Message", placeholder: "Optional text" },
        ],
        build: (v) => (v.number ? `SMSTO:${v.number.trim()}:${v.message ?? ""}` : ""),
    },
    Phone: {
        fields: [{ key: "number", label: "Phone number", span: 2, placeholder: "+911234567890" }],
        build: (v) => (v.number ? `tel:${v.number.replace(/\s+/g, "")}` : ""),
    },
    Location: {
        fields: [
            { key: "lat", label: "Latitude", type: "number", step: "any", value: "12.9716" },
            { key: "lng", label: "Longitude", type: "number", step: "any", value: "77.5946" },
        ],
        build: (v) => (v.lat && v.lng ? `geo:${v.lat},${v.lng}` : ""),
    },
    "Calendar event": {
        fields: [
            { key: "title", label: "Title", placeholder: "Team sync" },
            { key: "location", label: "Location", placeholder: "Meeting room 2" },
            { key: "start", label: "Starts", type: "datetime-local" },
            { key: "end", label: "Ends", type: "datetime-local" },
        ],
        build: (v) => {
            if (!v.title || !v.start) return "";
            const stamp = (value) => `${value.replace(/[-:]/g, "").slice(0, 15)}00`.slice(0, 15);
            return [
                "BEGIN:VEVENT",
                `SUMMARY:${v.title}`,
                v.location ? `LOCATION:${v.location}` : "",
                `DTSTART:${stamp(v.start)}`,
                v.end ? `DTEND:${stamp(v.end)}` : "",
                "END:VEVENT",
            ].filter(Boolean).join("\n");
        },
    },
};

export function qrGenerator(host) {
    let contentType = "Text";
    let ecc = "M";
    let fields = null;
    let encoded = null;

    const scaleInput = input({ type: "number", value: "8", min: "2", max: "24" });
    const marginInput = input({ type: "number", value: "4", min: "0", max: "16" });
    const darkInput = input({ type: "color", value: "#20242b" });
    const lightInput = input({ type: "color", value: "#ffffff" });

    const canvas = el("canvas", {
        role: "img",
        "aria-label": "QR code preview",
        style: {
            imageRendering: "pixelated",
            maxWidth: "100%",
            height: "auto",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-raised-sm)",
        },
    });

    const status = statusBox();
    const detailHost = el("div", {});
    const fieldsHost = el("div", {});
    const payloadView = el("p", { class: "mono small wrap-anywhere muted" });

    const payload = () => CONTENT_TYPES[contentType].build(fields ? fields.values() : {});

    function draw() {
        const scale = clamp(Number(scaleInput.value) || 8, 2, 24);
        const margin = clamp(Number(marginInput.value) || 0, 0, 16);
        const dimension = (encoded.size + margin * 2) * scale;

        canvas.width = dimension;
        canvas.height = dimension;
        canvas.style.width = `${Math.min(dimension, 320)}px`;

        const context = canvas.getContext("2d");
        context.fillStyle = lightInput.value;
        context.fillRect(0, 0, dimension, dimension);
        context.fillStyle = darkInput.value;
        for (let y = 0; y < encoded.size; y += 1) {
            for (let x = 0; x < encoded.size; x += 1) {
                if (encoded.modules[y][x]) {
                    context.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
                }
            }
        }
    }

    function render() {
        status.reset();
        detailHost.replaceChildren();
        const text = payload();
        payloadView.textContent = text || "Fill in the fields above to build a payload.";

        if (!text) {
            encoded = null;
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        try {
            encoded = encodeQr(text, { ecc });
            draw();
            detailHost.append(keyValueList([
                ["Version", `${encoded.version} (${encoded.size} × ${encoded.size} modules)`],
                ["Error correction", `${encoded.ecc} — recovers up to ${{ L: "7%", M: "15%", Q: "25%", H: "30%" }[encoded.ecc]}`],
                ["Encoding mode", encoded.mode],
                ["Mask pattern", String(encoded.mask)],
                ["Payload size", `${new TextEncoder().encode(text).length} of ${encoded.capacity} bytes`],
            ]));
            status.success(`Version ${encoded.version} QR code generated`);
        } catch (error) {
            encoded = null;
            status.error("Could not build a QR code", error.message);
        }
    }

    const debouncedRender = debounce(render, 80);

    function renderFields() {
        fieldsHost.replaceChildren();
        fields = formGrid(CONTENT_TYPES[contentType].fields, { onChange: debouncedRender });
        fieldsHost.append(fields.node);
        render();
    }

    function currentSvg() {
        if (!encoded) return "";
        return qrToSvg(encoded, {
            scale: clamp(Number(scaleInput.value) || 8, 2, 24),
            margin: clamp(Number(marginInput.value) || 0, 0, 16),
            dark: darkInput.value,
            light: lightInput.value,
        });
    }

    function downloadPng() {
        if (!encoded) {
            toast("Nothing to download", "warning");
            return;
        }
        canvas.toBlob((blob) => {
            if (!blob) {
                toast("Could not export the image", "error");
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = el("a", { href: url, download: "qr-code.png" });
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast("Download started");
        }, "image/png");
    }

    for (const control of [scaleInput, marginInput, darkInput, lightInput]) {
        control.addEventListener("input", () => {
            if (encoded) draw();
        });
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Content" },
            segmented(
                Object.keys(CONTENT_TYPES).map((name) => ({ value: name, label: name })),
                {
                    value: contentType,
                    label: "Content type",
                    onChange: (value) => {
                        contentType = value;
                        renderFields();
                    },
                },
            ),
            fieldsHost,
        ),
        panel(
            { title: "Appearance" },
            el(
                "div",
                { class: "form-grid" },
                field("Module size (px)", scaleInput),
                field("Quiet zone (modules)", marginInput, { hint: "4 or more is recommended" }),
                field("Foreground", darkInput),
                field("Background", lightInput),
            ),
            el(
                "div",
                { class: "field" },
                el("span", { class: "field-label", text: "Error correction" }),
                segmented(ECC_LEVELS, {
                    value: ecc,
                    label: "Error correction level",
                    onChange: (value) => {
                        ecc = value;
                        render();
                    },
                }),
                el("span", {
                    class: "field-hint",
                    text: "Higher levels survive more damage but need a denser code.",
                }),
            ),
        ),
        status,
        panel(
            {
                title: "QR code",
                actions: [
                    button("PNG", { glyph: "↓", small: true, onClick: downloadPng }),
                    button("SVG", {
                        glyph: "↓",
                        small: true,
                        onClick: () => {
                            const svg = currentSvg();
                            if (!svg) {
                                toast("Nothing to download", "warning");
                                return;
                            }
                            downloadText("qr-code.svg", svg, "image/svg+xml;charset=utf-8");
                            toast("Download started");
                        },
                    }),
                    button("Copy SVG", {
                        glyph: "⧉",
                        small: true,
                        onClick: async () => {
                            const svg = currentSvg();
                            if (!svg) {
                                toast("Nothing to copy", "warning");
                                return;
                            }
                            const ok = await copyToClipboard(svg);
                            toast(ok ? "SVG copied" : "Copy failed", ok ? "success" : "error");
                        },
                    }),
                ],
            },
            el("div", { style: { display: "grid", placeItems: "center", padding: "8px 0" } }, canvas),
            detailHost,
        ),
        panel(
            { title: "Encoded payload", actions: [copyButton(() => payload(), { small: true })] },
            payloadView,
        ),
        el("p", {
            class: "small muted",
            text: "Encoding happens entirely in this tab — Wi-Fi passwords and other content are never uploaded or stored.",
        }),
    ));

    renderFields();
}
