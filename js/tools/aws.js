"use strict";

import {
    el, panel, input, field, select, checkbox, statusBox, keyValueList, dataTable,
    copyButton, codeOutput, formGrid,
} from "../ui.js";
import { debounce } from "../utils.js";

/* ========================================================================== */
/* ARN parser                                                                 */
/* ========================================================================== */

export function parseArn(text) {
    const arn = text.trim();
    if (!arn.startsWith("arn:")) throw new Error('An ARN must start with "arn:".');

    const parts = arn.split(":");
    if (parts.length < 6) throw new Error("An ARN has at least six colon-separated segments.");

    const [, partition, service, region, accountId] = parts;
    const resource = parts.slice(5).join(":");

    let resourceType = "";
    let resourceId = resource;
    const slash = resource.indexOf("/");
    const colon = resource.indexOf(":");
    if (slash !== -1 && (colon === -1 || slash < colon)) {
        resourceType = resource.slice(0, slash);
        resourceId = resource.slice(slash + 1);
    } else if (colon !== -1) {
        resourceType = resource.slice(0, colon);
        resourceId = resource.slice(colon + 1);
    }

    if (!partition) throw new Error("The partition segment is empty (expected aws, aws-cn or aws-us-gov).");
    if (!service) throw new Error("The service segment is empty.");

    return { arn, partition, service, region, accountId, resource, resourceType, resourceId };
}

export function arnParser(host) {
    const arnInput = input({ placeholder: "arn:aws:ec2:ap-south-1:123456789012:instance/i-0abc1234" });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        const text = arnInput.value.trim();
        if (!text) {
            copyText = "";
            resultHost.append(el("p", { class: "small muted", text: "Paste an ARN to break it apart." }));
            return;
        }
        try {
            const parsed = parseArn(text);
            const rows = [
                ["Partition", parsed.partition],
                ["Service", parsed.service],
                ["Region", parsed.region || "(global service)"],
                ["Account ID", parsed.accountId || "(not scoped to an account)"],
                ["Resource", parsed.resource],
                ["Resource type", parsed.resourceType || "(none)"],
                ["Resource ID", parsed.resourceId],
            ];
            copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
            resultHost.append(keyValueList(rows));
            status.success("ARN parsed — no AWS calls were made");
        } catch (error) {
            copyText = "";
            status.error("That does not look like an ARN", error.message);
        }
    }

    arnInput.addEventListener("input", debounce(render, 100));

    const examples = el(
        "div",
        { class: "btn-row" },
        ...[
            "arn:aws:s3:::my-bucket/reports/2026.csv",
            "arn:aws:iam::123456789012:role/AppRole",
            "arn:aws:lambda:eu-west-1:123456789012:function:processor",
        ].map((example) => el("button", {
            class: "btn btn-sm",
            type: "button",
            text: example.split(":")[2] || "example",
            title: example,
            onClick: () => {
                arnInput.value = example;
                render();
            },
        })),
    );

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "ARN" }, field("Amazon Resource Name", arnInput), examples),
        status,
        panel({ title: "Components", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    render();
    arnInput.focus();
}

/* ========================================================================== */
/* Region lookup                                                              */
/* ========================================================================== */

const REGIONS = [
    ["us-east-1", "US East (N. Virginia)", "North America", "aws"],
    ["us-east-2", "US East (Ohio)", "North America", "aws"],
    ["us-west-1", "US West (N. California)", "North America", "aws"],
    ["us-west-2", "US West (Oregon)", "North America", "aws"],
    ["ca-central-1", "Canada (Central)", "North America", "aws"],
    ["ca-west-1", "Canada West (Calgary)", "North America", "aws"],
    ["sa-east-1", "South America (São Paulo)", "South America", "aws"],
    ["eu-west-1", "Europe (Ireland)", "Europe", "aws"],
    ["eu-west-2", "Europe (London)", "Europe", "aws"],
    ["eu-west-3", "Europe (Paris)", "Europe", "aws"],
    ["eu-central-1", "Europe (Frankfurt)", "Europe", "aws"],
    ["eu-central-2", "Europe (Zurich)", "Europe", "aws"],
    ["eu-north-1", "Europe (Stockholm)", "Europe", "aws"],
    ["eu-south-1", "Europe (Milan)", "Europe", "aws"],
    ["eu-south-2", "Europe (Spain)", "Europe", "aws"],
    ["ap-south-1", "Asia Pacific (Mumbai)", "Asia Pacific", "aws"],
    ["ap-south-2", "Asia Pacific (Hyderabad)", "Asia Pacific", "aws"],
    ["ap-southeast-1", "Asia Pacific (Singapore)", "Asia Pacific", "aws"],
    ["ap-southeast-2", "Asia Pacific (Sydney)", "Asia Pacific", "aws"],
    ["ap-southeast-3", "Asia Pacific (Jakarta)", "Asia Pacific", "aws"],
    ["ap-southeast-4", "Asia Pacific (Melbourne)", "Asia Pacific", "aws"],
    ["ap-northeast-1", "Asia Pacific (Tokyo)", "Asia Pacific", "aws"],
    ["ap-northeast-2", "Asia Pacific (Seoul)", "Asia Pacific", "aws"],
    ["ap-northeast-3", "Asia Pacific (Osaka)", "Asia Pacific", "aws"],
    ["ap-east-1", "Asia Pacific (Hong Kong)", "Asia Pacific", "aws"],
    ["me-south-1", "Middle East (Bahrain)", "Middle East", "aws"],
    ["me-central-1", "Middle East (UAE)", "Middle East", "aws"],
    ["il-central-1", "Israel (Tel Aviv)", "Middle East", "aws"],
    ["af-south-1", "Africa (Cape Town)", "Africa", "aws"],
    ["cn-north-1", "China (Beijing)", "China", "aws-cn"],
    ["cn-northwest-1", "China (Ningxia)", "China", "aws-cn"],
    ["us-gov-east-1", "AWS GovCloud (US-East)", "North America", "aws-us-gov"],
    ["us-gov-west-1", "AWS GovCloud (US-West)", "North America", "aws-us-gov"],
];

export function regionLookup(host) {
    const searchInput = input({ placeholder: "mumbai, eu-west, GovCloud…", type: "search" });
    const tableHost = el("div", {});

    function render() {
        const needle = searchInput.value.trim().toLowerCase();
        const rows = REGIONS.filter(([code, name, geography, partition]) =>
            !needle ||
            code.includes(needle) ||
            name.toLowerCase().includes(needle) ||
            geography.toLowerCase().includes(needle) ||
            partition.includes(needle));

        tableHost.replaceChildren();
        tableHost.append(rows.length
            ? dataTable(["Code", "Name", "Geography", "Partition"], rows.map((row) => [...row]))
            : el("p", { class: "small muted", text: "No region matches that search." }));
    }

    searchInput.addEventListener("input", render);
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Search" }, field("Region code, city or partition", searchInput)),
        panel({ title: "Regions" }, tableHost),
        el("p", {
            class: "small muted",
            text: "Static reference data bundled with the app — no AWS API calls are made. Region availability changes over time.",
        }),
    ));
    render();
    searchInput.focus();
}

/* ========================================================================== */
/* CLI builder                                                                */
/* ========================================================================== */

const quote = (value) => (/^[\w./:@=-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`);

const COMMANDS = {
    "s3: list buckets": { fields: [], build: () => ["s3", "ls"] },
    "s3: list objects": {
        fields: [{ key: "bucket", label: "Bucket", placeholder: "my-bucket" }, { key: "prefix", label: "Prefix", placeholder: "logs/" }],
        build: (v) => ["s3", "ls", `s3://${v.bucket}${v.prefix ? `/${v.prefix}` : ""}`, "--human-readable", "--summarize"],
    },
    "s3: sync folder": {
        fields: [
            { key: "source", label: "Source", placeholder: "./dist" },
            { key: "bucket", label: "Bucket", placeholder: "my-bucket" },
            { key: "prefix", label: "Prefix", placeholder: "" },
        ],
        build: (v) => ["s3", "sync", v.source, `s3://${v.bucket}${v.prefix ? `/${v.prefix}` : ""}`, "--delete"],
    },
    "ec2: describe instances": {
        fields: [{ key: "filter", label: "Name tag", placeholder: "web-*" }],
        build: (v) => [
            "ec2", "describe-instances",
            ...(v.filter ? ["--filters", `Name=tag:Name,Values=${v.filter}`] : []),
            "--query", "Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType}",
        ],
    },
    "ec2: start instance": {
        fields: [{ key: "id", label: "Instance ID", placeholder: "i-0abc1234" }],
        build: (v) => ["ec2", "start-instances", "--instance-ids", v.id],
    },
    "lambda: invoke": {
        fields: [
            { key: "name", label: "Function name", placeholder: "processor" },
            { key: "payload", label: "Payload (JSON)", placeholder: '{"key":"value"}' },
        ],
        build: (v) => [
            "lambda", "invoke", "--function-name", v.name,
            ...(v.payload ? ["--payload", v.payload, "--cli-binary-format", "raw-in-base64-out"] : []),
            "response.json",
        ],
    },
    "logs: tail group": {
        fields: [{ key: "group", label: "Log group", placeholder: "/aws/lambda/processor" }],
        build: (v) => ["logs", "tail", v.group, "--follow", "--format", "short"],
    },
    "sts: who am I": { fields: [], build: () => ["sts", "get-caller-identity"] },
    "ecr: login": {
        fields: [{ key: "account", label: "Account ID", placeholder: "123456789012" }],
        build: (v, common) => [
            "ecr", "get-login-password",
            "|", "docker", "login", "--username", "AWS", "--password-stdin",
            `${v.account}.dkr.ecr.${common.region || "REGION"}.amazonaws.com`,
        ],
    },
};

export function cliBuilder(host) {
    const commandSelect = select(Object.keys(COMMANDS), { value: "s3: list objects" });
    const profileInput = input({ placeholder: "default" });
    const regionInput = input({ placeholder: "ap-south-1" });
    const outputSelect = select(["", "json", "text", "table", "yaml"].map((value) => ({
        value,
        label: value || "(default)",
    })));
    let dryRun = false;

    const fieldsHost = el("div", {});
    const output = codeOutput("Your command appears here");
    let fields = null;

    function build() {
        const definition = COMMANDS[commandSelect.value];
        const values = fields ? fields.values() : {};
        const common = { region: regionInput.value.trim(), profile: profileInput.value.trim() };
        const args = definition.build(values, common).filter((part) => part !== undefined && part !== "");

        const tail = [];
        if (common.profile) tail.push("--profile", common.profile);
        if (common.region) tail.push("--region", common.region);
        if (outputSelect.value) tail.push("--output", outputSelect.value);
        if (dryRun && commandSelect.value.startsWith("ec2")) tail.push("--dry-run");

        const pipeIndex = args.indexOf("|");
        const parts = pipeIndex === -1
            ? ["aws", ...args, ...tail]
            : ["aws", ...args.slice(0, pipeIndex), ...tail, ...args.slice(pipeIndex)];

        output.setValue(parts.map((part) => (part === "|" ? "|" : quote(String(part)))).join(" "));
    }

    function renderFields() {
        const definition = COMMANDS[commandSelect.value];
        fieldsHost.replaceChildren();
        if (!definition.fields.length) {
            fields = null;
            fieldsHost.append(el("p", { class: "small muted", text: "This command takes no extra arguments." }));
        } else {
            fields = formGrid(definition.fields, { onChange: build });
            fieldsHost.append(fields.node);
        }
        build();
    }

    commandSelect.addEventListener("change", renderFields);
    for (const control of [profileInput, regionInput, outputSelect]) {
        control.addEventListener("input", build);
        control.addEventListener("change", build);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Command" }, field("What do you want to do?", commandSelect), fieldsHost),
        panel(
            { title: "Common flags" },
            el(
                "div",
                { class: "form-grid" },
                field("Profile", profileInput),
                field("Region", regionInput),
                field("Output format", outputSelect),
            ),
            checkbox("Add --dry-run (EC2 commands)", { onChange: (checked) => { dryRun = checked; build(); } }),
        ),
        panel({ title: "Generated command", actions: [copyButton(() => output.getValue(), { small: true })] }, output),
        el("p", { class: "small muted", text: "Commands are generated locally — nothing is executed or sent anywhere." }),
    ));

    renderFields();
}
