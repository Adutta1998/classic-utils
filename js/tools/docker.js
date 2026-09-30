"use strict";

import { createIO, el, panel, input, field, statusBox, keyValueList, copyButton } from "../ui.js";
import { stringify as toYaml } from "../lib/yaml.js";
import { debounce } from "../utils.js";

/* ========================================================================== */
/* docker run → compose                                                       */
/* ========================================================================== */

/** Shell-aware tokenizer: handles quotes and line continuations. */
export function tokenize(command) {
    const text = command.replace(/\\\r?\n/g, " ").trim();
    const tokens = [];
    let current = "";
    let quote = null;
    let started = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quote) {
            if (char === quote) quote = null;
            else current += char;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            started = true;
            continue;
        }
        if (/\s/.test(char)) {
            if (started || current) tokens.push(current);
            current = "";
            started = false;
            continue;
        }
        current += char;
        started = true;
    }
    if (started || current) tokens.push(current);
    if (quote) throw new Error("Unbalanced quote in the command.");
    return tokens;
}

const VALUE_FLAGS = new Set([
    "--name", "-p", "--publish", "-e", "--env", "--env-file", "-v", "--volume", "--mount",
    "--network", "--net", "--restart", "-w", "--workdir", "-u", "--user", "--entrypoint",
    "--label", "-l", "--hostname", "-h", "--cap-add", "--cap-drop", "--device", "--dns",
    "--add-host", "--log-driver", "--log-opt", "-m", "--memory", "--cpus", "--shm-size",
    "--health-cmd", "--health-interval", "--health-retries", "--health-timeout", "--pull",
    "--platform", "--stop-signal", "--ulimit", "--security-opt", "--tmpfs", "--link", "--ipc",
]);

const BOOL_FLAGS = new Set([
    "-d", "--detach", "--rm", "-i", "--interactive", "-t", "--tty", "-it", "-ti",
    "--privileged", "--init", "--read-only", "--no-healthcheck",
]);

export function dockerRunToCompose(command) {
    const tokens = tokenize(command);
    if (!tokens.length) throw new Error("Nothing to convert.");

    let index = 0;
    if (tokens[index] === "sudo") index += 1;
    if (tokens[index] !== "docker") throw new Error('The command should start with "docker".');
    index += 1;
    if (tokens[index] === "container") index += 1;
    if (tokens[index] !== "run") throw new Error('Only "docker run" commands can be converted.');
    index += 1;

    const flags = [];
    while (index < tokens.length) {
        const token = tokens[index];
        if (!token.startsWith("-")) break;

        if (token.includes("=") && token.startsWith("--")) {
            const splitAt = token.indexOf("=");
            flags.push([token.slice(0, splitAt), token.slice(splitAt + 1)]);
            index += 1;
            continue;
        }
        if (BOOL_FLAGS.has(token)) {
            flags.push([token, true]);
            index += 1;
            continue;
        }
        if (VALUE_FLAGS.has(token)) {
            const value = tokens[index + 1];
            if (value === undefined) throw new Error(`Flag ${token} is missing its value.`);
            flags.push([token, value]);
            index += 2;
            continue;
        }
        // Unknown flag: assume it takes a value when the next token is not a flag.
        const next = tokens[index + 1];
        if (next !== undefined && !next.startsWith("-")) {
            flags.push([token, next]);
            index += 2;
        } else {
            flags.push([token, true]);
            index += 1;
        }
    }

    const image = tokens[index];
    if (!image) throw new Error("No image was found in the command.");
    const commandArgs = tokens.slice(index + 1);

    const service = { image };
    const ports = [];
    const environment = {};
    const envFiles = [];
    const volumes = [];
    const labels = [];
    const capAdd = [];
    const capDrop = [];
    const devices = [];
    const dns = [];
    const extraHosts = [];
    const networks = [];
    const tmpfs = [];
    const deploy = {};
    const healthcheck = {};
    const unsupported = [];
    let serviceName = "";

    for (const [flag, value] of flags) {
        switch (flag) {
            case "--name": serviceName = value; break;
            case "-p": case "--publish": ports.push(value); break;
            case "-e": case "--env": {
                const splitAt = value.indexOf("=");
                if (splitAt === -1) environment[value] = "";
                else environment[value.slice(0, splitAt)] = value.slice(splitAt + 1);
                break;
            }
            case "--env-file": envFiles.push(value); break;
            case "-v": case "--volume": case "--mount": volumes.push(value); break;
            case "--tmpfs": tmpfs.push(value); break;
            case "--network": case "--net": networks.push(value); break;
            case "--restart": service.restart = value; break;
            case "-w": case "--workdir": service.working_dir = value; break;
            case "-u": case "--user": service.user = value; break;
            case "--entrypoint": service.entrypoint = value; break;
            case "-h": case "--hostname": service.hostname = value; break;
            case "--label": case "-l": labels.push(value); break;
            case "--cap-add": capAdd.push(value); break;
            case "--cap-drop": capDrop.push(value); break;
            case "--device": devices.push(value); break;
            case "--dns": dns.push(value); break;
            case "--add-host": extraHosts.push(value); break;
            case "--platform": service.platform = value; break;
            case "--stop-signal": service.stop_signal = value; break;
            case "--ipc": service.ipc = value; break;
            case "--privileged": service.privileged = true; break;
            case "--init": service.init = true; break;
            case "--read-only": service.read_only = true; break;
            case "-i": case "--interactive": service.stdin_open = true; break;
            case "-t": case "--tty": service.tty = true; break;
            case "-it": case "-ti": service.stdin_open = true; service.tty = true; break;
            case "--shm-size": service.shm_size = value; break;
            case "--log-driver": service.logging = { ...(service.logging ?? {}), driver: value }; break;
            case "--health-cmd": healthcheck.test = ["CMD-SHELL", value]; break;
            case "--health-interval": healthcheck.interval = value; break;
            case "--health-timeout": healthcheck.timeout = value; break;
            case "--health-retries": healthcheck.retries = Number(value) || value; break;
            case "-m": case "--memory": deploy.memory = value; break;
            case "--cpus": deploy.cpus = String(value); break;
            case "-d": case "--detach": case "--rm": break; // no Compose equivalent
            default: unsupported.push(flag); break;
        }
    }

    if (ports.length) service.ports = ports;
    if (Object.keys(environment).length) service.environment = environment;
    if (envFiles.length) service.env_file = envFiles;
    if (volumes.length) service.volumes = volumes;
    if (tmpfs.length) service.tmpfs = tmpfs;
    if (labels.length) service.labels = labels;
    if (capAdd.length) service.cap_add = capAdd;
    if (capDrop.length) service.cap_drop = capDrop;
    if (devices.length) service.devices = devices;
    if (dns.length) service.dns = dns;
    if (extraHosts.length) service.extra_hosts = extraHosts;
    if (networks.length) service.networks = networks;
    if (commandArgs.length) service.command = commandArgs;
    if (Object.keys(healthcheck).length) service.healthcheck = healthcheck;
    if (Object.keys(deploy).length) {
        service.deploy = { resources: { limits: {
            ...(deploy.cpus ? { cpus: deploy.cpus } : {}),
            ...(deploy.memory ? { memory: deploy.memory } : {}),
        } } };
    }

    const name = serviceName || image.split("/").pop().split(":")[0].split("@")[0];
    const compose = { services: { [name]: service } };

    const namedVolumes = volumes
        .map((entry) => entry.split(":")[0])
        .filter((source) => source && !source.startsWith(".") && !source.startsWith("/") && !source.includes("="));
    if (namedVolumes.length) {
        compose.volumes = Object.fromEntries(namedVolumes.map((volume) => [volume, null]));
    }
    if (networks.length) {
        compose.networks = Object.fromEntries(networks
            .filter((network) => !["host", "bridge", "none"].includes(network))
            .map((network) => [network, { external: true }]));
        if (!Object.keys(compose.networks).length) delete compose.networks;
    }

    return { yaml: toYaml(compose), name, unsupported };
}

const SAMPLE = `docker run -d \\
  --name nginx \\
  -p 8080:80 \\
  -e TZ=Europe/Berlin \\
  -v ./site:/usr/share/nginx/html:ro \\
  --restart unless-stopped \\
  nginx:latest`;

export function runToCompose(host) {
    const io = createIO({
        inputLabel: "docker run command",
        inputPlaceholder: SAMPLE,
        outputLabel: "compose.yaml",
        outputPlaceholder: "The Compose service appears here",
        downloadName: "compose.yaml",
        actions: [{ label: "Convert", glyph: "🐳", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    function run() {
        io.status.reset();
        const text = io.input.value.trim();
        if (!text) {
            io.setOutput("");
            return;
        }
        try {
            const result = dockerRunToCompose(text);
            io.setOutput(result.yaml);
            if (result.unsupported.length) {
                io.status.warn(
                    `Service "${result.name}" generated`,
                    `Flags without a Compose equivalent were skipped: ${result.unsupported.join(", ")}`,
                );
            } else {
                io.status.success(`Service "${result.name}" generated`);
            }
        } catch (error) {
            io.setOutput("");
            io.status.error("Could not convert that command", error.message);
        }
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "About" },
            el("p", {
                class: "small muted",
                text: "Supports ports, environment variables, volumes, networks, restart policy, capabilities, health checks and resource limits. Runtime-only flags such as -d and --rm have no Compose equivalent and are dropped.",
            }),
            el("button", {
                class: "btn btn-sm",
                type: "button",
                style: { alignSelf: "flex-start" },
                text: "Load example",
                onClick: () => {
                    io.input.value = SAMPLE;
                    io.input.dispatchEvent(new Event("input"));
                },
            }),
        ),
        io.node,
    ));
    io.input.focus();
}

/* ========================================================================== */
/* Image reference parser                                                     */
/* ========================================================================== */

export function parseImageReference(reference) {
    const text = reference.trim();
    if (!text) throw new Error("Enter an image reference.");

    let remainder = text;
    let digest = "";
    const digestIndex = remainder.indexOf("@");
    if (digestIndex !== -1) {
        digest = remainder.slice(digestIndex + 1);
        remainder = remainder.slice(0, digestIndex);
    }

    let tag = "";
    const lastColon = remainder.lastIndexOf(":");
    const lastSlash = remainder.lastIndexOf("/");
    if (lastColon > lastSlash) {
        tag = remainder.slice(lastColon + 1);
        remainder = remainder.slice(0, lastColon);
    }

    const segments = remainder.split("/");
    let registry = "docker.io";
    let explicitRegistry = false;
    if (segments.length > 1 && (segments[0].includes(".") || segments[0].includes(":") || segments[0] === "localhost")) {
        registry = segments.shift();
        explicitRegistry = true;
    }

    const repository = segments.join("/");
    if (!repository) throw new Error("No repository name was found.");
    const namespace = segments.length > 1 ? segments.slice(0, -1).join("/") : (explicitRegistry ? "" : "library");

    return {
        registry,
        namespace,
        repository,
        name: segments[segments.length - 1],
        tag: tag || (digest ? "" : "latest"),
        digest,
        canonical: `${registry}/${namespace ? `${namespace}/` : ""}${segments[segments.length - 1]}` +
            `${tag ? `:${tag}` : ""}${digest ? `@${digest}` : ""}`,
    };
}

export function imageParser(host) {
    const referenceInput = input({
        placeholder: "123456789012.dkr.ecr.eu-west-1.amazonaws.com/team/api:1.4.2",
        value: "nginx:1.27-alpine",
    });
    const status = statusBox();
    const resultHost = el("div", {});
    let copyText = "";

    function render() {
        status.reset();
        resultHost.replaceChildren();
        try {
            const parsed = parseImageReference(referenceInput.value);
            const rows = [
                ["Registry", parsed.registry],
                ["Namespace", parsed.namespace || "(none)"],
                ["Repository", parsed.repository],
                ["Image name", parsed.name],
                ["Tag", parsed.tag || "(digest pinned)"],
                ["Digest", parsed.digest || "(none)"],
                ["Fully qualified", parsed.canonical],
            ];
            copyText = rows.map(([key, value]) => `${key}: ${value}`).join("\n");
            resultHost.append(keyValueList(rows));
            if (parsed.tag === "latest") {
                status.warn("Tag is 'latest'", "Pin an explicit tag or digest for reproducible deployments.");
            } else if (parsed.digest) {
                status.success("Digest pinned — fully reproducible");
            } else {
                status.success("Reference parsed");
            }
        } catch (error) {
            copyText = "";
            status.error("Could not parse that reference", error.message);
        }
    }

    referenceInput.addEventListener("input", debounce(render, 80));
    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Image reference" }, field("Image", referenceInput)),
        status,
        panel({ title: "Components", actions: [copyButton(() => copyText, { small: true })] }, resultHost),
    ));
    render();
    referenceInput.focus();
}
