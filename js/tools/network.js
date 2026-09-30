"use strict";

import {
    el, panel, input, field, select, statusBox, keyValueList, dataTable, copyButton,
    codeOutput, formGrid, metaLabel,
} from "../ui.js";
import { debounce, formatNumber } from "../utils.js";

/* ========================================================================== */
/* IPv4 helpers                                                               */
/* ========================================================================== */

export function ipToLong(ip) {
    const octets = ip.trim().split(".");
    if (octets.length !== 4) throw new Error(`"${ip}" is not a dotted-quad IPv4 address.`);
    return octets.reduce((acc, octet) => {
        if (!/^\d{1,3}$/.test(octet)) throw new Error(`"${octet}" is not a valid octet.`);
        const value = Number(octet);
        if (value > 255) throw new Error(`Octet ${value} is greater than 255.`);
        return acc * 256 + value;
    }, 0);
}

export const longToIp = (value) =>
    [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

export const prefixToMask = (prefix) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export function maskToPrefix(mask) {
    const value = ipToLong(mask);
    const binary = value.toString(2).padStart(32, "0");
    if (!/^1*0*$/.test(binary)) throw new Error(`${mask} is not a contiguous subnet mask.`);
    return binary.replace(/0+$/, "").length;
}

export function parseCidr(text) {
    const [addressPart, prefixPart] = text.trim().split("/");
    if (prefixPart === undefined) throw new Error("Include a prefix length, for example 10.0.0.0/24.");
    const prefix = Number(prefixPart);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error("The prefix must be between 0 and 32.");
    const address = ipToLong(addressPart);
    const mask = prefixToMask(prefix);
    const network = (address & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - prefix);
    const usable = prefix >= 31 ? (prefix === 32 ? 1 : 2) : total - 2;
    return {
        address, prefix, mask, network, broadcast, total, usable,
        firstUsable: prefix >= 31 ? network : network + 1,
        lastUsable: prefix >= 31 ? broadcast : broadcast - 1,
    };
}

const toBinary = (value) =>
    [24, 16, 8, 0].map((shift) => (((value >>> shift) & 255).toString(2).padStart(8, "0"))).join(".");

function addressType(value) {
    const octets = [24, 16, 8, 0].map((shift) => (value >>> shift) & 255);
    const [a, b] = octets;
    if (a === 10) return "Private (RFC 1918)";
    if (a === 172 && b >= 16 && b <= 31) return "Private (RFC 1918)";
    if (a === 192 && b === 168) return "Private (RFC 1918)";
    if (a === 127) return "Loopback";
    if (a === 169 && b === 254) return "Link-local (APIPA)";
    if (a === 100 && b >= 64 && b <= 127) return "Carrier-grade NAT (RFC 6598)";
    if (a >= 224 && a <= 239) return "Multicast";
    if (a >= 240) return "Reserved";
    if (a === 0) return "This network";
    return "Public";
}

const ipClass = (value) => {
    const first = (value >>> 24) & 255;
    if (first < 128) return "A";
    if (first < 192) return "B";
    if (first < 224) return "C";
    if (first < 240) return "D (multicast)";
    return "E (reserved)";
};

/* ========================================================================== */
/* CIDR calculator                                                            */
/* ========================================================================== */

export function cidrCalculator(host) {
    const cidrInput = input({ placeholder: "10.0.0.0/16", value: "10.0.0.0/16" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const text = cidrInput.value.trim();
        if (!text) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Enter a CIDR block such as 192.168.1.0/24." }));
            return;
        }
        try {
            const info = parseCidr(text);
            const rows = [
                ["CIDR", `${longToIp(info.network)}/${info.prefix}`],
                ["Network address", longToIp(info.network)],
                ["Broadcast address", info.prefix === 32 ? "—" : longToIp(info.broadcast)],
                ["First usable host", longToIp(info.firstUsable)],
                ["Last usable host", longToIp(info.lastUsable)],
                ["Subnet mask", longToIp(info.mask)],
                ["Wildcard mask", longToIp(~info.mask >>> 0)],
                ["Total addresses", formatNumber(info.total)],
                ["Usable addresses", formatNumber(info.usable)],
                ["Address type", addressType(info.network)],
                ["Network (binary)", toBinary(info.network)],
                ["Mask (binary)", toBinary(info.mask)],
            ];
            copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
            resultHost.append(keyValueList(rows));
            if (info.prefix >= 31) {
                status.warn(
                    `/${info.prefix} networks are special`,
                    info.prefix === 32 ? "A /32 describes a single host." : "A /31 is a point-to-point link (RFC 3021).",
                );
            } else {
                status.success(`${formatNumber(info.usable)} usable addresses`);
            }
        } catch (error) {
            copyText = "";
            status.error("Invalid CIDR block", error.message);
        }
    }

    cidrInput.addEventListener("input", debounce(render, 80));
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "CIDR block" }, field("Network in CIDR notation", cidrInput)),
        status,
        panel({ title: "Details", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    render();
    cidrInput.focus();
}

/* ========================================================================== */
/* Subnet splitter                                                            */
/* ========================================================================== */

const MAX_SUBNETS = 256;

export function subnetSplitter(host) {
    const baseInput = input({ placeholder: "10.0.0.0/16", value: "10.0.0.0/16" });
    const newPrefix = input({ type: "number", value: "24", min: "1", max: "32" });
    const status = statusBox();
    const tableHost = el("div", {});
    const meta = metaLabel("");
    let copyText = "";

    function render() {
        status.reset();
        tableHost.replaceChildren();
        meta.textContent = "";
        try {
            const base = parseCidr(baseInput.value);
            const prefix = Number(newPrefix.value);
            if (!Number.isInteger(prefix) || prefix < base.prefix || prefix > 32) {
                throw new Error(`The new prefix must be between /${base.prefix} and /32.`);
            }
            const count = 2 ** (prefix - base.prefix);
            const size = 2 ** (32 - prefix);
            const shown = Math.min(count, MAX_SUBNETS);

            const rows = [];
            for (let index = 0; index < shown; index += 1) {
                const network = (base.network + index * size) >>> 0;
                const broadcast = (network + size - 1) >>> 0;
                rows.push([
                    String(index),
                    `${longToIp(network)}/${prefix}`,
                    prefix >= 31 ? longToIp(network) : longToIp(network + 1),
                    prefix >= 31 ? longToIp(broadcast) : longToIp(broadcast - 1),
                    formatNumber(prefix >= 31 ? size : size - 2),
                ]);
            }

            tableHost.append(dataTable(["#", "CIDR", "First host", "Last host", "Usable"], rows));
            meta.textContent = count > shown
                ? `showing ${formatNumber(shown)} of ${formatNumber(count)}`
                : `${formatNumber(count)} subnets`;
            copyText = rows.map((row) => row[1]).join("\n");
            status.success(
                `${formatNumber(count)} × /${prefix} subnets`,
                `Terraform: cidrsubnet("${longToIp(base.network)}/${base.prefix}", ${prefix - base.prefix}, index)`,
            );
        } catch (error) {
            copyText = "";
            status.error("Cannot split that block", error.message);
        }
    }

    for (const control of [baseInput, newPrefix]) control.addEventListener("input", debounce(render, 80));

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Split" },
            el("div", { class: "form-grid" }, field("Base CIDR", baseInput), field("New prefix length", newPrefix)),
        ),
        status,
        panel({ title: "Subnets", meta, actions: [copyButton(() => copyText, { small: true })] }, tableHost),
    ));
    render();
}

/* ========================================================================== */
/* IPv4 calculator                                                            */
/* ========================================================================== */

export function ipv4Calculator(host) {
    const addressInput = input({ placeholder: "192.168.1.42", value: "192.168.1.42" });
    const maskInput = input({ placeholder: "255.255.255.0 or 24", value: "24" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        try {
            const address = ipToLong(addressInput.value);
            const maskText = maskInput.value.trim();
            const prefix = /^\d{1,2}$/.test(maskText) ? Number(maskText) : maskToPrefix(maskText);
            if (prefix < 0 || prefix > 32) throw new Error("The prefix must be between 0 and 32.");
            const info = parseCidr(`${longToIp(address)}/${prefix}`);

            const rows = [
                ["Address", longToIp(address)],
                ["CIDR", `${longToIp(info.network)}/${prefix}`],
                ["Integer", formatNumber(address >>> 0)],
                ["Hexadecimal", `0x${(address >>> 0).toString(16).toUpperCase().padStart(8, "0")}`],
                ["Binary", toBinary(address)],
                ["Class", ipClass(address)],
                ["Type", addressType(address)],
                ["Network", longToIp(info.network)],
                ["Broadcast", prefix === 32 ? "—" : longToIp(info.broadcast)],
                ["Host range", `${longToIp(info.firstUsable)} – ${longToIp(info.lastUsable)}`],
                ["Reverse DNS", `${longToIp(address).split(".").reverse().join(".")}.in-addr.arpa`],
            ];
            copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
            resultHost.append(keyValueList(rows));
            status.success("Address parsed");
        } catch (error) {
            copyText = "";
            status.error("Invalid address", error.message);
        }
    }

    for (const control of [addressInput, maskInput]) control.addEventListener("input", debounce(render, 80));

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Address" },
            el(
                "div",
                { class: "form-grid" },
                field("IPv4 address", addressInput),
                field("Subnet mask or prefix", maskInput, { hint: "255.255.255.0 or 24" }),
            ),
        ),
        status,
        panel({ title: "Details", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    render();
    addressInput.focus();
}

/* ========================================================================== */
/* Port lookup                                                                */
/* ========================================================================== */

const PORTS = [
    [20, "TCP", "FTP data transfer"],
    [21, "TCP", "FTP control"],
    [22, "TCP", "SSH / SFTP / SCP"],
    [23, "TCP", "Telnet (insecure)"],
    [25, "TCP", "SMTP mail relay"],
    [53, "TCP/UDP", "DNS"],
    [67, "UDP", "DHCP server"],
    [68, "UDP", "DHCP client"],
    [69, "UDP", "TFTP"],
    [80, "TCP", "HTTP"],
    [110, "TCP", "POP3"],
    [123, "UDP", "NTP"],
    [135, "TCP", "Microsoft RPC"],
    [137, "UDP", "NetBIOS name service"],
    [139, "TCP", "NetBIOS session"],
    [143, "TCP", "IMAP"],
    [161, "UDP", "SNMP"],
    [389, "TCP", "LDAP"],
    [443, "TCP", "HTTPS / HTTP-3 (QUIC on UDP)"],
    [445, "TCP", "SMB over TCP"],
    [465, "TCP", "SMTPS"],
    [514, "UDP", "Syslog"],
    [587, "TCP", "SMTP submission (STARTTLS)"],
    [636, "TCP", "LDAPS"],
    [873, "TCP", "rsync"],
    [993, "TCP", "IMAPS"],
    [995, "TCP", "POP3S"],
    [1080, "TCP", "SOCKS proxy"],
    [1194, "UDP", "OpenVPN"],
    [1433, "TCP", "Microsoft SQL Server"],
    [1521, "TCP", "Oracle Database"],
    [1723, "TCP", "PPTP"],
    [2049, "TCP", "NFS"],
    [2375, "TCP", "Docker daemon (plain)"],
    [2376, "TCP", "Docker daemon (TLS)"],
    [2379, "TCP", "etcd client"],
    [3000, "TCP", "Common dev server / Grafana"],
    [3128, "TCP", "Squid proxy"],
    [3306, "TCP", "MySQL / MariaDB"],
    [3389, "TCP", "RDP"],
    [4369, "TCP", "Erlang port mapper"],
    [5432, "TCP", "PostgreSQL"],
    [5671, "TCP", "AMQP over TLS"],
    [5672, "TCP", "AMQP / RabbitMQ"],
    [5900, "TCP", "VNC"],
    [6379, "TCP", "Redis"],
    [6443, "TCP", "Kubernetes API server"],
    [8000, "TCP", "Common dev HTTP server"],
    [8080, "TCP", "HTTP alternate / proxies"],
    [8443, "TCP", "HTTPS alternate"],
    [8888, "TCP", "Jupyter / alternate HTTP"],
    [9000, "TCP", "SonarQube / MinIO / PHP-FPM"],
    [9090, "TCP", "Prometheus"],
    [9200, "TCP", "Elasticsearch HTTP"],
    [9300, "TCP", "Elasticsearch transport"],
    [11211, "TCP/UDP", "Memcached"],
    [15672, "TCP", "RabbitMQ management UI"],
    [27017, "TCP", "MongoDB"],
];

export function portLookup(host) {
    const searchInput = input({ placeholder: "443, redis, postgres…", type: "search" });
    const tableHost = el("div", {});

    function render() {
        const needle = searchInput.value.trim().toLowerCase();
        const rows = PORTS.filter(([port, protocol, service]) =>
            !needle ||
            String(port) === needle ||
            String(port).startsWith(needle) ||
            service.toLowerCase().includes(needle) ||
            protocol.toLowerCase().includes(needle));

        tableHost.replaceChildren();
        tableHost.append(rows.length
            ? dataTable(["Port", "Protocol", "Service"], rows.map(([port, protocol, service]) => [String(port), protocol, service]))
            : el("p", { class: "small muted", text: "No well-known port matches that search." }));
    }

    searchInput.addEventListener("input", render);
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Search" }, field("Port number or service name", searchInput)),
        panel({ title: "Well-known ports" }, tableHost),
    ));
    render();
    searchInput.focus();
}

/* ========================================================================== */
/* HTTP status lookup                                                         */
/* ========================================================================== */

const STATUSES = [
    [100, "Continue", "The client should continue with the request body."],
    [101, "Switching Protocols", "The server is switching protocols, typically to WebSocket."],
    [103, "Early Hints", "Preload hints sent before the final response."],
    [200, "OK", "Standard success response."],
    [201, "Created", "A new resource was created; use the Location header."],
    [202, "Accepted", "Accepted for processing but not completed."],
    [204, "No Content", "Success with an intentionally empty body."],
    [206, "Partial Content", "Range request satisfied."],
    [301, "Moved Permanently", "Permanent redirect; clients should update links."],
    [302, "Found", "Temporary redirect; method may change to GET."],
    [303, "See Other", "Redirect to a resource using GET."],
    [304, "Not Modified", "Cached copy is still fresh."],
    [307, "Temporary Redirect", "Temporary redirect preserving the method."],
    [308, "Permanent Redirect", "Permanent redirect preserving the method."],
    [400, "Bad Request", "Malformed syntax or invalid request framing."],
    [401, "Unauthorized", "Authentication is required or failed."],
    [403, "Forbidden", "Authenticated but not allowed."],
    [404, "Not Found", "No resource matches the URI."],
    [405, "Method Not Allowed", "The method is not supported for this resource."],
    [408, "Request Timeout", "The client took too long to send the request."],
    [409, "Conflict", "State conflict, such as a concurrent update."],
    [410, "Gone", "The resource was intentionally removed."],
    [413, "Payload Too Large", "The body exceeds server limits."],
    [415, "Unsupported Media Type", "The Content-Type is not supported."],
    [422, "Unprocessable Content", "Well-formed but semantically invalid."],
    [429, "Too Many Requests", "Rate limited; check Retry-After."],
    [431, "Request Header Fields Too Large", "Headers exceed server limits."],
    [451, "Unavailable For Legal Reasons", "Blocked for legal reasons."],
    [500, "Internal Server Error", "Unhandled server-side failure."],
    [501, "Not Implemented", "The server does not support the functionality."],
    [502, "Bad Gateway", "Invalid response from an upstream server."],
    [503, "Service Unavailable", "Overloaded or down for maintenance."],
    [504, "Gateway Timeout", "Upstream server did not respond in time."],
    [505, "HTTP Version Not Supported", "The HTTP version is not supported."],
    [507, "Insufficient Storage", "The server cannot store the representation."],
    [511, "Network Authentication Required", "Captive portal style authentication needed."],
];

export function httpStatusLookup(host) {
    const searchInput = input({ placeholder: "404, timeout, redirect…", type: "search" });
    const tableHost = el("div", {});

    function render() {
        const needle = searchInput.value.trim().toLowerCase();
        const rows = STATUSES.filter(([code, name, description]) =>
            !needle ||
            String(code).startsWith(needle) ||
            name.toLowerCase().includes(needle) ||
            description.toLowerCase().includes(needle) ||
            (needle.endsWith("xx") && String(code).startsWith(needle[0])));

        tableHost.replaceChildren();
        tableHost.append(rows.length
            ? dataTable(
                ["Code", "Name", "Meaning"],
                rows.map(([code, name, description]) => [
                    String(code),
                    name,
                    el("span", { class: "small", text: description }),
                ]),
            )
            : el("p", { class: "small muted", text: "No status code matches that search." }));
    }

    searchInput.addEventListener("input", render);
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Search" }, field("Status code or description", searchInput, { hint: "Try 4xx to list all client errors." })),
        panel({ title: "HTTP status codes" }, tableHost),
    ));
    render();
    searchInput.focus();
}

/* ========================================================================== */
/* MAC formatter                                                              */
/* ========================================================================== */

export function macFormatter(host) {
    const macInput = input({ placeholder: "00:1A:2B:3C:4D:5E" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const raw = macInput.value.trim();
        if (!raw) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Enter a MAC address in any common format." }));
            return;
        }
        const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
        if (hex.length !== 12) {
            copyText = "";
            status.error("A MAC address needs 12 hex digits", `Found ${hex.length}.`);
            return;
        }
        const pairs = hex.match(/.{2}/g);
        const firstOctet = Number.parseInt(pairs[0], 16);
        const rows = [
            ["Colon separated", pairs.join(":")],
            ["Hyphen separated", pairs.join("-")],
            ["Cisco style", hex.match(/.{4}/g).join(".").toLowerCase()],
            ["No separator", hex],
            ["Lowercase", pairs.join(":").toLowerCase()],
            ["OUI (vendor prefix)", pairs.slice(0, 3).join(":")],
            ["Device identifier", pairs.slice(3).join(":")],
            ["Administration", (firstOctet & 0b10) ? "Locally administered" : "Universally administered"],
            ["Cast type", (firstOctet & 0b1) ? "Multicast" : "Unicast"],
            ["EUI-64 interface ID", toEui64(pairs)],
        ];
        copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
        resultHost.append(keyValueList(rows));
        status.success("MAC address parsed");
    }

    function toEui64(pairs) {
        const flipped = (Number.parseInt(pairs[0], 16) ^ 0b10).toString(16).padStart(2, "0").toUpperCase();
        const parts = [flipped, pairs[1], pairs[2], "FF", "FE", pairs[3], pairs[4], pairs[5]];
        return parts.join("").match(/.{4}/g).join(":").toLowerCase();
    }

    macInput.addEventListener("input", debounce(render, 80));
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "MAC address" }, field("Any separator style", macInput)),
        status,
        panel({ title: "Formats", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    render();
    macInput.focus();
}

/* ========================================================================== */
/* DNS record helper                                                          */
/* ========================================================================== */

const RECORD_FIELDS = {
    A: [{ key: "value", label: "IPv4 address", placeholder: "203.0.113.10" }],
    AAAA: [{ key: "value", label: "IPv6 address", placeholder: "2001:db8::1" }],
    CNAME: [{ key: "value", label: "Target hostname", placeholder: "app.example.com." }],
    MX: [
        { key: "priority", label: "Priority", type: "number", value: "10" },
        { key: "value", label: "Mail server", placeholder: "mail.example.com." },
    ],
    TXT: [{ key: "value", label: "Text value", placeholder: "v=spf1 include:_spf.example.com ~all" }],
    NS: [{ key: "value", label: "Name server", placeholder: "ns1.example.com." }],
    SRV: [
        { key: "priority", label: "Priority", type: "number", value: "10" },
        { key: "weight", label: "Weight", type: "number", value: "5" },
        { key: "port", label: "Port", type: "number", value: "443" },
        { key: "value", label: "Target", placeholder: "service.example.com." },
    ],
    CAA: [
        { key: "flags", label: "Flags", type: "number", value: "0" },
        { key: "tag", label: "Tag", type: "select", options: ["issue", "issuewild", "iodef"], value: "issue" },
        { key: "value", label: "Value", placeholder: "letsencrypt.org" },
    ],
};

export function dnsRecordHelper(host) {
    const typeSelect = select(Object.keys(RECORD_FIELDS), { value: "A" });
    const nameInput = input({ placeholder: "www", value: "www" });
    const ttlInput = input({ type: "number", value: "3600", min: "0" });
    const fieldsHost = el("div", {});
    const output = codeOutput("The zone file record appears here");
    let fields = null;

    function build() {
        const type = typeSelect.value;
        const values = fields ? fields.values() : {};
        const name = nameInput.value.trim() || "@";
        const ttl = ttlInput.value.trim() || "3600";

        let data;
        if (type === "MX") data = `${values.priority} ${values.value}`;
        else if (type === "SRV") data = `${values.priority} ${values.weight} ${values.port} ${values.value}`;
        else if (type === "CAA") data = `${values.flags} ${values.tag} "${values.value}"`;
        else if (type === "TXT") data = `"${String(values.value ?? "").replace(/"/g, '\\"')}"`;
        else data = values.value ?? "";

        const record = `${name}\t${ttl}\tIN\t${type}\t${data}`;
        const notes = {
            CNAME: "# A CNAME cannot coexist with other records on the same name.",
            TXT: "# Strings longer than 255 characters must be split into multiple quoted chunks.",
            MX: "# Lower priority values are preferred.",
            SRV: "# The record name should look like _service._proto.name",
        };
        output.setValue(notes[type] ? `${notes[type]}\n${record}` : record);
    }

    function renderFields() {
        fieldsHost.replaceChildren();
        fields = formGrid(RECORD_FIELDS[typeSelect.value], { onChange: build });
        fieldsHost.append(fields.node);
        build();
    }

    typeSelect.addEventListener("change", renderFields);
    for (const control of [nameInput, ttlInput]) control.addEventListener("input", build);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Record" },
            el(
                "div",
                { class: "form-grid" },
                field("Record type", typeSelect),
                field("Name", nameInput, { hint: "Use @ for the zone apex" }),
                field("TTL (seconds)", ttlInput),
            ),
            fieldsHost,
        ),
        panel({ title: "Zone file record", actions: [copyButton(() => output.getValue(), { small: true })] }, output),
        el("p", { class: "small muted", text: "Trailing dots make a name fully qualified. Names without a dot are relative to the zone." }),
    ));

    renderFields();
}
