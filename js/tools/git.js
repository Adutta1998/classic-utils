"use strict";

import {
    el, panel, input, field, select, checkbox, textarea, codeOutput, copyButton,
    downloadButton, statusBox, segmented, button, formGrid, toast,
} from "../ui.js";
import { splitWords, formatNumber, copyToClipboard } from "../utils.js";

/* ========================================================================== */
/* Git command builder                                                        */
/* ========================================================================== */

const COMMANDS = {
    "Create and switch to a branch": {
        fields: [{ key: "branch", label: "Branch name", value: "feature/new-thing" }],
        build: (v) => [`git switch -c ${v.branch}`],
    },
    "Undo the last commit (keep changes)": { fields: [], build: () => ["git reset --soft HEAD~1"] },
    "Discard all local changes": {
        fields: [],
        build: () => ["git restore .", "git clean -fd  # also removes untracked files"],
    },
    "Amend the last commit message": { fields: [], build: () => ["git commit --amend"] },
    "Rebase onto the latest main": {
        fields: [{ key: "base", label: "Base branch", value: "main" }],
        build: (v) => [`git fetch origin`, `git rebase origin/${v.base}`],
    },
    "Squash the last N commits": {
        fields: [{ key: "count", label: "How many commits", type: "number", value: "3" }],
        build: (v) => [`git rebase -i HEAD~${v.count || 2}`],
    },
    "Stash work in progress": {
        fields: [{ key: "message", label: "Stash message", value: "wip" }],
        build: (v) => [`git stash push -u -m "${v.message}"`, "git stash list", "git stash pop"],
    },
    "Delete a branch locally and remotely": {
        fields: [{ key: "branch", label: "Branch name", value: "feature/old" }],
        build: (v) => [`git branch -d ${v.branch}`, `git push origin --delete ${v.branch}`],
    },
    "Cherry-pick a commit": {
        fields: [{ key: "sha", label: "Commit SHA", value: "abc1234" }],
        build: (v) => [`git cherry-pick ${v.sha}`],
    },
    "Find the commit that broke something": {
        fields: [{ key: "good", label: "Last good commit", value: "v1.2.0" }],
        build: (v) => ["git bisect start", "git bisect bad", `git bisect good ${v.good}`, "# test, then: git bisect good|bad", "git bisect reset"],
    },
    "Show what changed in a file": {
        fields: [{ key: "path", label: "File path", value: "src/app.js" }],
        build: (v) => [`git log --follow -p -- ${v.path}`],
    },
    "Compare two branches": {
        fields: [
            { key: "left", label: "Base", value: "main" },
            { key: "right", label: "Compare", value: "feature/new-thing" },
        ],
        build: (v) => [`git log --oneline ${v.left}..${v.right}`, `git diff ${v.left}...${v.right} --stat`],
    },
    "Add a remote and push": {
        fields: [
            { key: "url", label: "Remote URL", value: "git@github.com:user/repo.git" },
            { key: "branch", label: "Branch", value: "main" },
        ],
        build: (v) => [`git remote add origin ${v.url}`, `git push -u origin ${v.branch}`],
    },
};

export function commandBuilder(host) {
    const commandSelect = select(Object.keys(COMMANDS), { value: "Create and switch to a branch" });
    const fieldsHost = el("div", {});
    const output = codeOutput("The commands appear here");
    let fields = null;

    function build() {
        const definition = COMMANDS[commandSelect.value];
        output.setValue(definition.build(fields ? fields.values() : {}).join("\n"));
    }

    function renderFields() {
        const definition = COMMANDS[commandSelect.value];
        fieldsHost.replaceChildren();
        if (definition.fields.length) {
            fields = formGrid(definition.fields, { onChange: build });
            fieldsHost.append(fields.node);
        } else {
            fields = null;
            fieldsHost.append(el("p", { class: "small muted", text: "This recipe needs no extra input." }));
        }
        build();
    }

    commandSelect.addEventListener("change", renderFields);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "What do you want to do?" }, field("Task", commandSelect), fieldsHost),
        panel({ title: "Commands", actions: [copyButton(() => output.getValue(), { small: true })] }, output),
        el("p", { class: "small muted", text: "Read each command before running it — some rewrite history." }),
    ));

    renderFields();
}

/* ========================================================================== */
/* Gitignore generator                                                        */
/* ========================================================================== */

const TEMPLATES = {
    Python: `__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
dist/
*.egg-info/
.eggs/
.venv/
venv/
env/
.tox/
.nox/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
coverage.xml
htmlcov/
.ipynb_checkpoints/`,
    Node: `node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.pnpm-store/
dist/
build/
.cache/
coverage/
*.tsbuildinfo
.eslintcache`,
    Java: `*.class
*.jar
*.war
*.ear
target/
build/
.gradle/
out/
hs_err_pid*
replay_pid*`,
    Go: `*.exe
*.test
*.out
/bin/
/vendor/
go.work.sum`,
    Rust: `/target/
**/*.rs.bk
Cargo.lock  # keep this for binaries, ignore for libraries`,
    Flutter: `.dart_tool/
.packages
.pub-cache/
.pub/
build/
.flutter-plugins
.flutter-plugins-dependencies
*.iml`,
    Android: `*.apk
*.aab
*.ap_
*.dex
local.properties
.gradle/
build/
captures/
.externalNativeBuild/
.cxx/`,
    Terraform: `.terraform/
.terraform.lock.hcl
*.tfstate
*.tfstate.*
crash.log
crash.*.log
*.tfvars
*.tfvars.json
override.tf
override.tf.json
*_override.tf
.terraformrc
terraform.rc`,
    Docker: `.dockerignore
docker-compose.override.yml`,
    Linux: `*~
.fuse_hidden*
.directory
.Trash-*
.nfs*`,
    Windows: `Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db
Desktop.ini
$RECYCLE.BIN/
*.lnk`,
    macOS: `.DS_Store
.AppleDouble
.LSOverride
._*
.DocumentRevisions-V100
.Spotlight-V100
.Trashes`,
    "VS Code": `.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.code-workspace`,
    JetBrains: `.idea/
*.iws
*.iml
*.ipr
out/`,
    "Env files": `.env
.env.*
!.env.example
*.pem
*.key
secrets.json`,
};

export function gitignoreGenerator(host) {
    const selected = new Set(["Python", "VS Code", "macOS"]);
    const extraInput = textarea({ placeholder: "# Additional patterns\n*.local\ntmp/", size: "sm" });
    const output = codeOutput("Select templates to build a .gitignore");
    const status = statusBox();

    function build() {
        const blocks = [...selected]
            .sort()
            .map((name) => `# ---- ${name} ----\n${TEMPLATES[name]}`);
        const extra = extraInput.value.trim();
        if (extra) blocks.push(`# ---- Project specific ----\n${extra}`);
        const text = blocks.join("\n\n");
        output.setValue(text ? `${text}\n` : "");
        status.reset();
        if (selected.size) {
            const lines = text.split("\n").filter((line) => line && !line.startsWith("#")).length;
            status.success(`${selected.size} templates · ${formatNumber(lines)} patterns`);
        }
    }

    const checkboxes = el(
        "div",
        { class: "check-grid" },
        ...Object.keys(TEMPLATES).map((name) => checkbox(name, {
            checked: selected.has(name),
            onChange: (checked) => {
                if (checked) selected.add(name);
                else selected.delete(name);
                build();
            },
        })),
    );

    extraInput.addEventListener("input", build);

    host.append(el(
        "div",
        { class: "tool-body" },
        panel({ title: "Templates" }, checkboxes),
        panel({ title: "Extra patterns" }, extraInput),
        status,
        panel(
            {
                title: ".gitignore",
                actions: [
                    copyButton(() => output.getValue(), { small: true }),
                    downloadButton(() => output.getValue(), ".gitignore", { small: true }),
                ],
            },
            output,
        ),
    ));

    build();
}

/* ========================================================================== */
/* Branch name generator                                                      */
/* ========================================================================== */

const BRANCH_TYPES = ["feature", "fix", "hotfix", "chore", "refactor", "docs", "test", "release", "spike"];

export function branchNameGenerator(host) {
    const typeSelect = select(BRANCH_TYPES, { value: "feature" });
    const ticketInput = input({ placeholder: "PROJ-123" });
    const summaryInput = input({ placeholder: "add password reset flow" });
    const maxLength = input({ type: "number", value: "60", min: "10", max: "120" });
    const output = codeOutput("The branch name appears here");
    const status = statusBox();
    let separator = "-";
    let lowercase = true;

    function build() {
        const words = splitWords(summaryInput.value);
        let slug = words.join(separator);
        if (lowercase) slug = slug.toLowerCase();

        const ticket = ticketInput.value.trim().replace(/\s+/g, separator);
        const parts = [typeSelect.value, ticket, slug].filter(Boolean);
        let name = `${parts[0]}/${parts.slice(1).join(separator)}`.replace(/\/$/, "");

        const limit = Number(maxLength.value) || 60;
        if (name.length > limit) {
            name = name.slice(0, limit).replace(new RegExp(`${separator}[^${separator}]*$`), "");
        }

        status.reset();
        if (!words.length) {
            status.warn("Add a short summary", "Two to six words usually works best.");
            output.setValue(parts.join("/"));
            return;
        }
        output.setValue(`${name}\n\n# Create it with:\ngit switch -c ${name}`);
        status.success(`${name.length} characters`);
    }

    for (const control of [typeSelect, ticketInput, summaryInput, maxLength]) {
        control.addEventListener("input", build);
        control.addEventListener("change", build);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Branch" },
            el(
                "div",
                { class: "form-grid" },
                field("Type", typeSelect),
                field("Ticket / issue", ticketInput, { hint: "Optional" }),
                field("Max length", maxLength),
            ),
            field("Summary", summaryInput),
            el(
                "div",
                { class: "inline-row" },
                segmented(
                    [{ value: "-", label: "Hyphens" }, { value: "_", label: "Underscores" }],
                    { value: separator, label: "Separator", onChange: (value) => { separator = value; build(); } },
                ),
                checkbox("Lowercase", { checked: true, onChange: (checked) => { lowercase = checked; build(); } }),
            ),
        ),
        status,
        panel({ title: "Branch name", actions: [copyButton(() => output.getValue().split("\n")[0], { small: true })] }, output),
    ));

    build();
    summaryInput.focus();
}

/* ========================================================================== */
/* Commit message helper                                                      */
/* ========================================================================== */

const COMMIT_TYPES = [
    { value: "feat", label: "feat — a new feature" },
    { value: "fix", label: "fix — a bug fix" },
    { value: "docs", label: "docs — documentation only" },
    { value: "style", label: "style — formatting, no code change" },
    { value: "refactor", label: "refactor — neither fixes a bug nor adds a feature" },
    { value: "perf", label: "perf — performance improvement" },
    { value: "test", label: "test — adding or fixing tests" },
    { value: "build", label: "build — build system or dependencies" },
    { value: "ci", label: "ci — CI configuration" },
    { value: "chore", label: "chore — maintenance" },
    { value: "revert", label: "revert — reverts a previous commit" },
];

export function commitMessageHelper(host) {
    const typeSelect = select(COMMIT_TYPES, { value: "feat" });
    const scopeInput = input({ placeholder: "auth" });
    const subjectInput = input({ placeholder: "add password reset flow" });
    const bodyInput = textarea({ placeholder: "Why is this change needed? What does it do?", size: "sm" });
    const issueInput = input({ placeholder: "PROJ-123, #42" });
    const output = codeOutput("The commit message appears here");
    const status = statusBox();
    let breaking = false;

    function build() {
        const scope = scopeInput.value.trim();
        const subject = subjectInput.value.trim().replace(/\.$/, "");
        const header = `${typeSelect.value}${scope ? `(${scope})` : ""}${breaking ? "!" : ""}: ${subject}`;

        const lines = [header];
        const body = bodyInput.value.trim();
        if (body) lines.push("", ...body.split("\n"));

        const footers = [];
        if (breaking) footers.push(`BREAKING CHANGE: ${subject || "describe the incompatible change"}`);
        const issues = issueInput.value.trim();
        if (issues) footers.push(`Refs: ${issues}`);
        if (footers.length) lines.push("", ...footers);

        output.setValue(lines.join("\n"));

        status.reset();
        if (!subject) status.warn("Add a subject", "Describe the change in the imperative mood: “add”, not “added”.");
        else if (header.length > 72) status.warn(`Header is ${header.length} characters`, "Conventional Commits recommend 72 or fewer.");
        else status.success(`Header is ${header.length} characters`);
    }

    for (const control of [typeSelect, scopeInput, subjectInput, bodyInput, issueInput]) {
        control.addEventListener("input", build);
        control.addEventListener("change", build);
    }

    host.append(el(
        "div",
        { class: "tool-body" },
        panel(
            { title: "Message" },
            el(
                "div",
                { class: "form-grid" },
                field("Type", typeSelect),
                field("Scope", scopeInput, { hint: "Optional area of the codebase" }),
            ),
            field("Subject", subjectInput, { hint: "Imperative mood, no trailing period" }),
            field("Body", bodyInput),
            field("Related issues", issueInput),
            checkbox("Breaking change", { onChange: (checked) => { breaking = checked; build(); } }),
        ),
        status,
        panel(
            { title: "Commit message", actions: [copyButton(() => output.getValue(), { small: true })] },
            output,
        ),
        el("div", { class: "btn-row" }, button("Copy as git command", {
            glyph: "⧉",
            small: true,
            onClick: async () => {
                const message = output.getValue().split("\n\n").map((block) => `-m "${block.replace(/"/g, '\\"')}"`).join(" ");
                const ok = await copyToClipboard(`git commit ${message}`);
                toast(ok ? "Command copied" : "Copy failed", ok ? "success" : "error");
            },
        })),
    ));

    build();
    subjectInput.focus();
}
