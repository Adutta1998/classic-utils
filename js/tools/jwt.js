"use strict";

import { el, panel, textarea, codeOutput, statusBox, keyValueList, copyButton, countMeta } from "../ui.js";
import { base64UrlDecode, relativeTime, toLocalIso } from "../utils.js";

const CLAIM_LABELS = {
    iss: "Issuer (iss)",
    sub: "Subject (sub)",
    aud: "Audience (aud)",
    exp: "Expires at (exp)",
    nbf: "Not before (nbf)",
    iat: "Issued at (iat)",
    jti: "JWT ID (jti)",
};

function decodeSegment(segment) {
    return JSON.parse(base64UrlDecode(segment));
}

function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return String(seconds);
    return `${toLocalIso(date)} (${relativeTime(date)})`;
}

export function jwtDecoder(host) {
    const input = textarea({
        placeholder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature",
        size: "sm",
        "aria-label": "JWT",
    });
    const status = statusBox();
    const headerOut = codeOutput("Header appears here");
    const payloadOut = codeOutput("Payload appears here");
    const signatureOut = codeOutput("Signature appears here");
    const claimsPanel = panel({ title: "Standard claims" });

    function reset() {
        headerOut.setValue("");
        payloadOut.setValue("");
        signatureOut.setValue("");
        claimsPanel.replaceChildren(el("span", { class: "panel-title", text: "Standard claims" }));
    }

    function decode() {
        const token = input.value.trim().replace(/^Bearer\s+/i, "");
        status.reset();
        if (!token) {
            reset();
            return;
        }

        const parts = token.split(".");
        if (parts.length < 2) {
            reset();
            status.error("Not a JWT", "A JWT has three dot-separated parts: header.payload.signature.");
            return;
        }

        let header;
        let payload;
        try {
            header = decodeSegment(parts[0]);
            payload = decodeSegment(parts[1]);
        } catch {
            reset();
            status.error("Could not decode the token", "The header or payload is not valid Base64URL-encoded JSON.");
            return;
        }

        headerOut.setValue(JSON.stringify(header, null, 2));
        payloadOut.setValue(JSON.stringify(payload, null, 2));
        signatureOut.setValue(parts[2] ?? "(none)");

        const rows = [];
        for (const [claim, label] of Object.entries(CLAIM_LABELS)) {
            if (payload[claim] === undefined) continue;
            const value = ["exp", "iat", "nbf"].includes(claim) && typeof payload[claim] === "number"
                ? formatTime(payload[claim])
                : JSON.stringify(payload[claim]).replace(/^"|"$/g, "");
            rows.push([label, value]);
        }
        if (header.alg) rows.unshift(["Algorithm (alg)", header.alg]);

        claimsPanel.replaceChildren(el("span", { class: "panel-title", text: "Standard claims" }));
        claimsPanel.append(rows.length
            ? keyValueList(rows)
            : el("p", { class: "small muted", text: "This token carries no standard registered claims." }));

        if (typeof payload.exp === "number") {
            const expired = payload.exp * 1000 <= Date.now();
            const badge = el("span", {
                class: `badge ${expired ? "badge-danger" : "badge-success"}`,
                text: expired ? "Expired" : "Valid (not expired)",
            });
            claimsPanel.append(el("div", { class: "btn-row", style: { marginTop: "8px" } }, badge));
            if (expired) status.warn("Token has expired", `exp was ${formatTime(payload.exp)}`);
            else status.success("Token decoded — exp is in the future");
        } else {
            status.success("Token decoded");
        }
    }

    input.addEventListener("input", decode);

    const body = el(
        "div",
        { class: "tool-body" },
        panel(
            {
                title: "Token",
                meta: countMeta(input),
                actions: [
                    el("button", {
                        class: "btn btn-sm btn-danger",
                        type: "button",
                        text: "Clear",
                        onClick: () => {
                            input.value = "";
                            input.dispatchEvent(new Event("input"));
                            input.focus();
                        },
                    }),
                ],
            },
            input,
        ),
        status,
        el(
            "div",
            { class: "status status-warning" },
            el("span", { class: "status-glyph", "aria-hidden": "true", text: "⚠" }),
            el("span", { text: "Decoding does not verify the token signature. Never trust an unverified token." }),
        ),
        el(
            "div",
            { class: "io-grid" },
            panel({ title: "Header", actions: [copyButton(() => headerOut.getValue(), { small: true })] }, headerOut),
            panel({ title: "Payload", actions: [copyButton(() => payloadOut.getValue(), { small: true })] }, payloadOut),
        ),
        claimsPanel,
        panel({ title: "Signature", actions: [copyButton(() => signatureOut.getValue(), { small: true })] }, signatureOut),
    );

    host.append(body);
    input.focus();
}
