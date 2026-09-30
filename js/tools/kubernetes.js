"use strict";

import {
    el, panel, select, field, input, codeOutput, copyButton,
    downloadButton, statusBox, formGrid, keyValueList,
} from "../ui.js";
import { stringify as toYaml } from "../lib/yaml.js";
import { toLines, formatNumber } from "../utils.js";

/* ========================================================================== */
/* Manifest generator                                                         */
/* ========================================================================== */

const KINDS = ["Deployment", "Service", "ConfigMap", "Secret", "Ingress", "PersistentVolumeClaim"];

const parsePairs = (text) => {
    const pairs = {};
    for (const line of toLines(text)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const splitAt = trimmed.indexOf("=");
        if (splitAt === -1) continue;
        pairs[trimmed.slice(0, splitAt).trim()] = trimmed.slice(splitAt + 1).trim();
    }
    return pairs;
};

const FIELD_SPECS = {
    Deployment: [
        { key: "name", label: "Name", value: "web" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "image", label: "Image", value: "nginx:1.27-alpine" },
        { key: "replicas", label: "Replicas", type: "number", value: "2" },
        { key: "port", label: "Container port", type: "number", value: "80" },
        { key: "cpuRequest", label: "CPU request", value: "100m" },
        { key: "memoryRequest", label: "Memory request", value: "128Mi" },
        { key: "cpuLimit", label: "CPU limit", value: "500m" },
        { key: "memoryLimit", label: "Memory limit", value: "512Mi" },
        { key: "env", label: "Environment (KEY=value per line)", type: "textarea", span: 2, value: "LOG_LEVEL=info" },
    ],
    Service: [
        { key: "name", label: "Name", value: "web" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "type", label: "Type", type: "select", options: ["ClusterIP", "NodePort", "LoadBalancer"], value: "ClusterIP" },
        { key: "port", label: "Service port", type: "number", value: "80" },
        { key: "targetPort", label: "Target port", type: "number", value: "80" },
        { key: "selector", label: "Selector app label", value: "web" },
    ],
    ConfigMap: [
        { key: "name", label: "Name", value: "app-config" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "data", label: "Data (KEY=value per line)", type: "textarea", span: 2, value: "LOG_LEVEL=info\nTIMEOUT=30" },
    ],
    Secret: [
        { key: "name", label: "Name", value: "app-secret" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "type", label: "Type", type: "select", options: ["Opaque", "kubernetes.io/dockerconfigjson", "kubernetes.io/tls"], value: "Opaque" },
        { key: "data", label: "Data (KEY=value per line)", type: "textarea", span: 2, value: "API_TOKEN=replace-me" },
    ],
    Ingress: [
        { key: "name", label: "Name", value: "web" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "className", label: "Ingress class", value: "nginx" },
        { key: "host", label: "Host", value: "app.example.com" },
        { key: "path", label: "Path", value: "/" },
        { key: "service", label: "Backend service", value: "web" },
        { key: "port", label: "Backend port", type: "number", value: "80" },
        { key: "tlsSecret", label: "TLS secret (optional)", value: "web-tls" },
    ],
    PersistentVolumeClaim: [
        { key: "name", label: "Name", value: "data" },
        { key: "namespace", label: "Namespace", value: "default" },
        { key: "size", label: "Size", value: "10Gi" },
        { key: "accessMode", label: "Access mode", type: "select", options: ["ReadWriteOnce", "ReadWriteMany", "ReadOnlyMany"], value: "ReadWriteOnce" },
        { key: "storageClass", label: "Storage class (optional)", value: "gp3" },
    ],
};

const metadata = (values, labels) => ({
    name: values.name || "unnamed",
    namespace: values.namespace || "default",
    ...(labels ? { labels } : {}),
});

const BUILDERS = {
    Deployment(values) {
        const labels = { app: values.name || "app" };
        const env = Object.entries(parsePairs(values.env ?? ""))
            .map(([name, value]) => ({ name, value }));
        const container = {
            name: values.name || "app",
            image: values.image || "nginx:latest",
            imagePullPolicy: "IfNotPresent",
            ports: [{ containerPort: Number(values.port) || 80 }],
            ...(env.length ? { env } : {}),
            resources: {
                requests: { cpu: values.cpuRequest || "100m", memory: values.memoryRequest || "128Mi" },
                limits: { cpu: values.cpuLimit || "500m", memory: values.memoryLimit || "512Mi" },
            },
            readinessProbe: { httpGet: { path: "/", port: Number(values.port) || 80 }, initialDelaySeconds: 5, periodSeconds: 10 },
        };
        return {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: metadata(values, labels),
            spec: {
                replicas: Number(values.replicas) || 1,
                selector: { matchLabels: labels },
                template: {
                    metadata: { labels },
                    spec: {
                        securityContext: { runAsNonRoot: true },
                        containers: [container],
                    },
                },
            },
        };
    },
    Service(values) {
        return {
            apiVersion: "v1",
            kind: "Service",
            metadata: metadata(values),
            spec: {
                type: values.type || "ClusterIP",
                selector: { app: values.selector || values.name || "app" },
                ports: [{
                    name: "http",
                    protocol: "TCP",
                    port: Number(values.port) || 80,
                    targetPort: Number(values.targetPort) || Number(values.port) || 80,
                }],
            },
        };
    },
    ConfigMap(values) {
        return {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: metadata(values),
            data: parsePairs(values.data ?? ""),
        };
    },
    Secret(values) {
        return {
            apiVersion: "v1",
            kind: "Secret",
            metadata: metadata(values),
            type: values.type || "Opaque",
            stringData: parsePairs(values.data ?? ""),
        };
    },
    Ingress(values) {
        const rule = {
            host: values.host || "example.com",
            http: {
                paths: [{
                    path: values.path || "/",
                    pathType: "Prefix",
                    backend: {
                        service: {
                            name: values.service || "web",
                            port: { number: Number(values.port) || 80 },
                        },
                    },
                }],
            },
        };
        return {
            apiVersion: "networking.k8s.io/v1",
            kind: "Ingress",
            metadata: metadata(values),
            spec: {
                ingressClassName: values.className || "nginx",
                ...(values.tlsSecret ? { tls: [{ hosts: [values.host || "example.com"], secretName: values.tlsSecret }] } : {}),
                rules: [rule],
            },
        };
    },
    PersistentVolumeClaim(values) {
        return {
            apiVersion: "v1",
            kind: "PersistentVolumeClaim",
            metadata: metadata(values),
            spec: {
                accessModes: [values.accessMode || "ReadWriteOnce"],
                resources: { requests: { storage: values.size || "1Gi" } },
                ...(values.storageClass ? { storageClassName: values.storageClass } : {}),
            },
        };
    },
};

export function manifestGenerator(host) {
    const kindSelect = select(KINDS, { value: "Deployment" });
    const fieldsHost = el("div", {});
    const output = codeOutput("The manifest appears here");
    const status = statusBox();
    let fields = null;

    function build() {
        if (!fields) return;
        const kind = kindSelect.value;
        try {
            const manifest = BUILDERS[kind](fields.values());
            output.setValue(toYaml(manifest));
            if (kind === "Secret") {
                status.warn(
                    "Secrets are only Base64-encoded by Kubernetes, not encrypted",
                    "stringData is used here so values stay readable. Never commit real secrets to git — use a sealed secret or an external secret store.",
                );
            } else {
                status.success(`${kind} manifest generated`);
            }
        } catch (error) {
            output.setValue("");
            status.error("Could not build the manifest", error.message);
        }
    }

    function renderFields() {
        fieldsHost.replaceChildren();
        fields = formGrid(FIELD_SPECS[kindSelect.value], { onChange: build });
        fieldsHost.append(fields.node);
        build();
    }

    kindSelect.addEventListener("change", renderFields);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Resource" }, field("Kind", kindSelect), fieldsHost),
        status,
        panel(
            {
                title: "Manifest",
                actions: [
                    copyButton(() => output.getValue(), { small: true }),
                    downloadButton(() => output.getValue(), () => `${kindSelect.value.toLowerCase()}.yaml`, { small: true }),
                ],
            },
            output,
        ),
    ));

    renderFields();
}

/* ========================================================================== */
/* Resource converter                                                         */
/* ========================================================================== */

const MEMORY_UNITS = {
    "": 1,
    k: 1000, M: 1000 ** 2, G: 1000 ** 3, T: 1000 ** 4, P: 1000 ** 5,
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5,
};

export function parseMemory(text) {
    const match = /^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P|)$/.exec(text.trim());
    if (!match) throw new Error(`"${text}" is not a Kubernetes quantity (try 512Mi, 2Gi or 1500M).`);
    return Number(match[1]) * MEMORY_UNITS[match[2]];
}

export function parseCpu(text) {
    const value = text.trim();
    if (/^\d+(\.\d+)?m$/.test(value)) return Number(value.slice(0, -1));
    if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
    throw new Error(`"${text}" is not a CPU quantity (try 250m or 1.5).`);
}

export function resourceConverter(host) {
    const cpuInput = input({ placeholder: "250m or 1.5", value: "250m" });
    const memoryInput = input({ placeholder: "512Mi or 2Gi", value: "512Mi" });
    const status = statusBox();
    const cpuHost = el("div", {});
    const memoryHost = el("div", {});

    function render() {
        status.reset();
        cpuHost.replaceChildren();
        memoryHost.replaceChildren();
        const errors = [];

        try {
            const millicores = parseCpu(cpuInput.value);
            cpuHost.append(keyValueList([
                ["Millicores", `${formatNumber(millicores)}m`],
                ["Cores", String(millicores / 1000)],
                ["Percent of one core", `${formatNumber(millicores / 10)}%`],
                ["Nodes at 2 vCPU", (millicores / 2000).toFixed(3)],
            ]));
        } catch (error) {
            errors.push(error.message);
            cpuHost.append(el("p", { class: "small muted", text: "—" }));
        }

        try {
            const bytes = parseMemory(memoryInput.value);
            memoryHost.append(keyValueList([
                ["Bytes", formatNumber(bytes)],
                ["KiB", formatNumber(Math.round((bytes / 1024) * 100) / 100)],
                ["MiB", formatNumber(Math.round((bytes / 1024 ** 2) * 100) / 100)],
                ["GiB", String(Math.round((bytes / 1024 ** 3) * 1000) / 1000)],
                ["MB (decimal)", formatNumber(Math.round((bytes / 1000 ** 2) * 100) / 100)],
                ["GB (decimal)", String(Math.round((bytes / 1000 ** 3) * 1000) / 1000)],
            ]));
        } catch (error) {
            errors.push(error.message);
            memoryHost.append(el("p", { class: "small muted", text: "—" }));
        }

        if (errors.length) status.error("Check the quantities", errors.join("\n"));
        else status.success("Converted");
    }

    for (const control of [cpuInput, memoryInput]) control.addEventListener("input", render);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Quantities" },
            el("div", { class: "form-grid" }, field("CPU", cpuInput), field("Memory", memoryInput)),
        ),
        status,
        el(
            "div",
            { class: "io-grid" },
            panel({ title: "CPU" }, cpuHost),
            panel({ title: "Memory" }, memoryHost),
        ),
        el("p", {
            class: "small muted",
            text: "Kubernetes uses binary suffixes (Ki, Mi, Gi) and decimal suffixes (k, M, G). 1Mi = 1,048,576 bytes while 1M = 1,000,000 bytes.",
        }),
    ));

    render();
}
