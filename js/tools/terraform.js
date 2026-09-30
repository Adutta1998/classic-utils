"use strict";

import {
    el, panel, input, field, select, checkbox, textarea, codeOutput, copyButton,
    downloadButton, statusBox, segmented, button,
} from "../ui.js";
import { splitWords } from "../utils.js";

const hclString = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const toSnake = (text) => splitWords(text).map((word) => word.toLowerCase()).join("_") || "name";

/* ========================================================================== */
/* Variable generator                                                         */
/* ========================================================================== */

const TYPES = ["string", "number", "bool", "list(string)", "list(number)", "set(string)",
    "map(string)", "map(any)", "object({ ... })", "any"];

function formatDefault(type, raw) {
    const text = raw.trim();
    if (!text) return null;
    if (type === "number") return Number.isFinite(Number(text)) ? text : hclString(text);
    if (type === "bool") return /^(true|false)$/i.test(text) ? text.toLowerCase() : hclString(text);
    if (type.startsWith("list") || type.startsWith("set")) {
        if (text.startsWith("[")) return text;
        const items = text.split(",").map((item) => item.trim()).filter(Boolean);
        const quoted = type.includes("number") ? items : items.map(hclString);
        return `[${quoted.join(", ")}]`;
    }
    if (type.startsWith("map") || type.startsWith("object")) {
        if (text.startsWith("{")) return text;
        const entries = text.split(",").map((pair) => pair.split("=").map((part) => part.trim()));
        const lines = entries
            .filter(([key]) => key)
            .map(([key, value]) => `    ${key} = ${hclString(value ?? "")}`);
        return `{\n${lines.join("\n")}\n  }`;
    }
    return hclString(text);
}

export function variableGenerator(host) {
    const nameInput = input({ placeholder: "instance_type", value: "instance_type" });
    const typeSelect = select(TYPES, { value: "string" });
    const descriptionInput = input({ placeholder: "EC2 instance type for the application servers" });
    const defaultInput = input({ placeholder: "t3.micro" });
    const validationInput = input({ placeholder: "Optional: can(regex(\"^t3\\\\.\", var.instance_type))" });
    const output = codeOutput("The Terraform block appears here");
    const status = statusBox();

    const flags = { required: false, sensitive: false, nullable: true };

    function build() {
        const name = toSnake(nameInput.value);
        const type = typeSelect.value;
        const lines = [`variable "${name}" {`];
        lines.push(`  type        = ${type}`);
        if (descriptionInput.value.trim()) lines.push(`  description = ${hclString(descriptionInput.value.trim())}`);

        if (!flags.required) {
            const defaultValue = formatDefault(type, defaultInput.value);
            if (defaultValue !== null) lines.push(`  default     = ${defaultValue}`);
            else lines.push("  default     = null");
        }
        if (flags.sensitive) lines.push("  sensitive   = true");
        if (!flags.nullable) lines.push("  nullable    = false");

        if (validationInput.value.trim()) {
            lines.push("");
            lines.push("  validation {");
            lines.push(`    condition     = ${validationInput.value.trim()}`);
            lines.push(`    error_message = ${hclString(`${name} did not pass validation.`)}`);
            lines.push("  }");
        }
        lines.push("}");

        const usage = `# Usage\n# var.${name}\n\n# terraform.tfvars\n${name} = ${
            formatDefault(type, defaultInput.value) ?? hclString("value")}`;

        output.setValue(`${lines.join("\n")}\n\n${usage}`);
        status.success(flags.required ? "Required variable (no default)" : "Optional variable");
    }

    const controls = [nameInput, typeSelect, descriptionInput, defaultInput, validationInput];
    for (const control of controls) {
        control.addEventListener("input", build);
        control.addEventListener("change", build);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Variable" },
            el(
                "div",
                { class: "form-grid" },
                field("Name", nameInput, { hint: "Converted to snake_case" }),
                field("Type", typeSelect),
                field("Default value", defaultInput, { hint: "Comma-separated for lists, key=value for maps" }),
            ),
            field("Description", descriptionInput),
            field("Validation condition", validationInput, { hint: "Optional HCL expression" }),
            el(
                "div",
                { class: "check-grid" },
                checkbox("Required (no default)", { onChange: (checked) => { flags.required = checked; build(); } }),
                checkbox("Sensitive", { onChange: (checked) => { flags.sensitive = checked; build(); } }),
                checkbox("Nullable", { checked: true, onChange: (checked) => { flags.nullable = checked; build(); } }),
            ),
        ),
        status,
        panel(
            {
                title: "variables.tf",
                actions: [
                    copyButton(() => output.getValue(), { small: true }),
                    downloadButton(() => output.getValue(), "variables.tf", { small: true }),
                ],
            },
            output,
        ),
    ));

    build();
    nameInput.focus();
}

/* ========================================================================== */
/* Security group rule generator                                              */
/* ========================================================================== */

const PROTOCOLS = [
    { value: "tcp", label: "TCP" },
    { value: "udp", label: "UDP" },
    { value: "icmp", label: "ICMP" },
    { value: "-1", label: "All protocols" },
];

const COMMON_PORTS = { HTTP: "80", HTTPS: "443", SSH: "22", RDP: "3389", PostgreSQL: "5432", MySQL: "3306", Redis: "6379" };

export function securityGroupGenerator(host) {
    let direction = "ingress";
    let style = "modern";

    const sgInput = input({ placeholder: "aws_security_group.web.id", value: "aws_security_group.web.id" });
    const protocolSelect = select(PROTOCOLS, { value: "tcp" });
    const fromPort = input({ type: "number", value: "443", min: "-1", max: "65535" });
    const toPort = input({ type: "number", value: "443", min: "-1", max: "65535" });
    const cidrInput = textarea({ placeholder: "0.0.0.0/0\n10.0.0.0/8", size: "sm", value: "0.0.0.0/0" });
    const descriptionInput = input({ placeholder: "Allow HTTPS from anywhere", value: "Allow HTTPS from anywhere" });
    const output = codeOutput("The Terraform resource appears here");
    const status = statusBox();

    function cidrs() {
        return cidrInput.value.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    }

    function build() {
        const list = cidrs();
        const protocol = protocolSelect.value;
        const from = protocol === "-1" ? "-1" : fromPort.value || "0";
        const to = protocol === "-1" ? "-1" : toPort.value || from;
        const description = descriptionInput.value.trim() || `${direction} ${protocol} ${from}`;
        const baseName = toSnake(description).slice(0, 40) || `${direction}_rule`;

        status.reset();
        if (!list.length) {
            status.error("At least one CIDR block is required");
            output.setValue("");
            return;
        }
        if (list.some((cidr) => cidr === "0.0.0.0/0") && direction === "ingress" && protocol !== "-1") {
            status.warn("This rule is open to the whole internet", "Restrict the CIDR unless the service is public.");
        } else {
            status.success("Rule generated");
        }

        const blocks = list.map((cidr, index) => {
            const suffix = list.length > 1 ? `_${index + 1}` : "";
            if (style === "modern") {
                const resource = `aws_vpc_security_group_${direction}_rule`;
                return [
                    `resource "${resource}" "${baseName}${suffix}" {`,
                    `  security_group_id = ${sgInput.value.trim() || "aws_security_group.this.id"}`,
                    `  description       = ${hclString(description)}`,
                    `  cidr_ipv4         = ${hclString(cidr)}`,
                    `  ip_protocol       = ${hclString(protocol)}`,
                    ...(protocol === "-1" ? [] : [`  from_port         = ${from}`, `  to_port           = ${to}`]),
                    "}",
                ].join("\n");
            }
            return [
                `resource "aws_security_group_rule" "${baseName}${suffix}" {`,
                `  type              = ${hclString(direction)}`,
                `  security_group_id = ${sgInput.value.trim() || "aws_security_group.this.id"}`,
                `  description       = ${hclString(description)}`,
                `  protocol          = ${hclString(protocol)}`,
                `  from_port         = ${from}`,
                `  to_port           = ${to}`,
                `  cidr_blocks       = [${hclString(cidr)}]`,
                "}",
            ].join("\n");
        });

        output.setValue(blocks.join("\n\n"));
    }

    const controls = [sgInput, protocolSelect, fromPort, toPort, cidrInput, descriptionInput];
    for (const control of controls) {
        control.addEventListener("input", build);
        control.addEventListener("change", build);
    }

    const presets = el(
        "div",
        { class: "btn-row" },
        ...Object.entries(COMMON_PORTS).map(([label, port]) => button(label, {
            small: true,
            onClick: () => {
                fromPort.value = port;
                toPort.value = port;
                protocolSelect.value = "tcp";
                descriptionInput.value = `Allow ${label}`;
                build();
            },
        })),
    );

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Rule" },
            el(
                "div",
                { class: "inline-row" },
                segmented(
                    [{ value: "ingress", label: "Ingress" }, { value: "egress", label: "Egress" }],
                    { value: direction, label: "Direction", onChange: (value) => { direction = value; build(); } },
                ),
                segmented(
                    [{ value: "modern", label: "aws_vpc_security_group_*_rule" }, { value: "classic", label: "aws_security_group_rule" }],
                    { value: style, label: "Resource style", onChange: (value) => { style = value; build(); } },
                ),
            ),
            el(
                "div",
                { class: "form-grid" },
                field("Security group ID reference", sgInput),
                field("Protocol", protocolSelect),
                field("From port", fromPort),
                field("To port", toPort),
            ),
            field("Description", descriptionInput),
            field("CIDR blocks (one per line)", cidrInput),
            presets,
        ),
        status,
        panel(
            {
                title: "Terraform",
                actions: [
                    copyButton(() => output.getValue(), { small: true }),
                    downloadButton(() => output.getValue(), "security_group.tf", { small: true }),
                ],
            },
            output,
        ),
    ));

    build();
}
