"use strict";

import { createIO, el, panel, segmented } from "../ui.js";
import { parse as parseYaml, stringify as toYaml } from "../lib/yaml.js";
import { parseJson } from "../lib/json-error.js";

const SAMPLE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80`;

export function yamlJson(host) {
    let direction = "yaml2json";

    const io = createIO({
        inputLabel: "Input",
        inputPlaceholder: SAMPLE,
        outputLabel: "Output",
        outputPlaceholder: "Converted document appears here",
        downloadName: () => (direction === "yaml2json" ? "converted.json" : "converted.yaml"),
        actions: [{ label: "Convert", glyph: "⇄", primary: true, onClick: () => run() }],
        onInput: () => run(),
        onRun: () => run(),
    });

    const modeSwitch = segmented(
        [
            { value: "yaml2json", label: "YAML → JSON" },
            { value: "json2yaml", label: "JSON → YAML" },
        ],
        {
            value: direction,
            label: "Conversion direction",
            onChange: (value) => {
                direction = value;
                run();
            },
        },
    );

    function run() {
        const text = io.input.value.trim();
        io.status.reset();
        if (!text) {
            io.setOutput("");
            return;
        }
        try {
            if (direction === "yaml2json") {
                const value = parseYaml(text);
                io.setOutput(JSON.stringify(value, null, 2));
                io.status.success("Converted to JSON");
            } else {
                const value = parseJson(text);
                io.setOutput(toYaml(value));
                io.status.success("Converted to YAML");
            }
        } catch (error) {
            io.setOutput("");
            io.status.error("Conversion failed", error.message);
        }
    }

    const options = panel(
        { title: "Direction" },
        modeSwitch,
        el("p", {
            class: "small muted",
            text: "Supports block mappings, sequences, flow collections, quoted scalars, comments and block scalars. Anchors, aliases and multi-document streams are not supported.",
        }),
        el("button", {
            class: "btn btn-sm",
            type: "button",
            text: "Load example",
            style: { alignSelf: "flex-start" },
            onClick: () => {
                io.input.value = direction === "yaml2json" ? SAMPLE : JSON.stringify(parseYaml(SAMPLE), null, 2);
                io.input.dispatchEvent(new Event("input"));
            },
        }),
    );

    host.append(el("div", { class: "tool-body" }, options, io.node));
    io.input.focus();
}
