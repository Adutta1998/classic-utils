"use strict";

/**
 * Central tool registry.
 *
 * Navigation, search, category pages, favourites and recents are all generated
 * from this list — adding a tool here is the only registration step required.
 * `load()` lazily imports the implementing module so the shell stays small.
 */

export const CATEGORIES = [
    { id: "developer", name: "Developer", icon: "🧑‍💻" },
    { id: "devops", name: "AWS / DevOps", icon: "☁️" },
    { id: "git", name: "Git", icon: "🔀" },
    { id: "python", name: "Python", icon: "🐍" },
    { id: "network", name: "Networking", icon: "🌐" },
    { id: "text", name: "Text", icon: "📝" },
    { id: "calc", name: "Calculators", icon: "🧮" },
    { id: "security", name: "Security", icon: "🔐" },
];

const lazy = (path, name) => () => import(path).then((module) => module[name]);

export const TOOLS = [
    /* ---------------------------------------------------------------- Developer */
    {
        id: "json-formatter",
        name: "JSON Formatter",
        category: "developer",
        description: "Format, validate, minify and sort JSON",
        keywords: ["json", "format", "pretty", "beautify", "minify", "validate", "sort"],
        icon: "{}",
        load: lazy("./tools/json.js", "jsonFormatter"),
    },
    {
        id: "yaml-json",
        name: "YAML ⇄ JSON",
        category: "developer",
        description: "Convert between YAML and JSON documents",
        keywords: ["yaml", "yml", "json", "convert", "kubernetes", "config"],
        icon: "Y/J",
        load: lazy("./tools/yaml.js", "yamlJson"),
    },
    {
        id: "base64",
        name: "Base64 Encode / Decode",
        category: "developer",
        description: "Unicode-safe Base64 and Base64URL conversion",
        keywords: ["base64", "encode", "decode", "b64", "url safe", "binary"],
        icon: "64",
        load: lazy("./tools/encoding.js", "base64Tool"),
    },
    {
        id: "url-encode",
        name: "URL Encode / Decode",
        category: "developer",
        description: "Percent-encode text and inspect query strings",
        keywords: ["url", "uri", "encode", "decode", "percent", "query", "escape"],
        icon: "%",
        load: lazy("./tools/encoding.js", "urlTool"),
    },
    {
        id: "jwt-decoder",
        name: "JWT Decoder",
        category: "developer",
        description: "Decode JWT header, payload and claims locally",
        keywords: ["jwt", "token", "bearer", "auth", "claims", "oauth", "decode"],
        icon: "JWT",
        load: lazy("./tools/jwt.js", "jwtDecoder"),
    },
    {
        id: "uuid-generator",
        name: "UUID Generator",
        category: "developer",
        description: "Generate UUID v4 and time-ordered v7 identifiers",
        keywords: ["uuid", "guid", "v4", "v7", "id", "random", "identifier"],
        icon: "ID",
        load: lazy("./tools/uuid.js", "uuidGenerator"),
    },
    {
        id: "hash-generator",
        name: "Hash Generator",
        category: "developer",
        description: "SHA-1, SHA-256, SHA-384 and SHA-512 digests",
        keywords: ["hash", "sha", "sha256", "sha512", "digest", "checksum", "crypto"],
        icon: "#",
        load: lazy("./tools/hash.js", "hashGenerator"),
    },
    {
        id: "regex-tester",
        name: "Regex Tester",
        category: "developer",
        description: "Test patterns with live match highlighting and groups",
        keywords: ["regex", "regexp", "pattern", "match", "capture", "groups", "test"],
        icon: ".*",
        load: lazy("./tools/regex.js", "regexTester"),
    },
    {
        id: "timestamp-converter",
        name: "Timestamp Converter",
        category: "developer",
        description: "Convert between Unix time, UTC, local time and ISO 8601",
        keywords: ["timestamp", "unix", "epoch", "date", "time", "iso", "utc"],
        icon: "⏱",
        load: lazy("./tools/timestamp.js", "timestampConverter"),
    },
    {
        id: "timezone-converter",
        name: "Time Zone Converter",
        category: "developer",
        description: "See one moment in time across any number of time zones",
        keywords: ["timezone", "time zone", "utc", "gmt", "ist", "pst", "meeting", "dst", "world clock"],
        icon: "🌐",
        load: lazy("./tools/timezone.js", "timezoneConverter"),
    },
    {
        id: "qr-generator",
        name: "QR Code Generator",
        category: "developer",
        description: "Create QR codes for text, URLs, Wi-Fi and more",
        keywords: ["qr", "qrcode", "barcode", "wifi", "url", "vcard", "scan", "png", "svg"],
        icon: "▣",
        load: lazy("./tools/qrcode.js", "qrGenerator"),
    },
    {
        id: "cron-helper",
        name: "Cron Expression Helper",
        category: "developer",
        description: "Explain cron expressions and preview upcoming runs",
        keywords: ["cron", "crontab", "schedule", "job", "next run", "kubernetes"],
        icon: "* *",
        load: lazy("./tools/cron.js", "cronHelper"),
    },

    /* ------------------------------------------------------------- AWS / DevOps */
    {
        id: "aws-arn-parser",
        name: "AWS ARN Parser",
        category: "devops",
        description: "Break an ARN into partition, service, region and resource",
        keywords: ["aws", "arn", "parse", "resource", "iam", "amazon"],
        icon: "ARN",
        load: lazy("./tools/aws.js", "arnParser"),
    },
    {
        id: "aws-region-lookup",
        name: "AWS Region Lookup",
        category: "devops",
        description: "Search AWS region codes, names and availability zones",
        keywords: ["aws", "region", "az", "availability zone", "location", "code"],
        icon: "🌍",
        load: lazy("./tools/aws.js", "regionLookup"),
    },
    {
        id: "aws-cli-builder",
        name: "AWS CLI Builder",
        category: "devops",
        description: "Compose common AWS CLI commands with the right flags",
        keywords: ["aws", "cli", "command", "s3", "ec2", "lambda", "builder"],
        icon: "$_",
        load: lazy("./tools/aws.js", "cliBuilder"),
    },
    {
        id: "terraform-variable",
        name: "Terraform Variable Generator",
        category: "devops",
        description: "Generate typed Terraform variable blocks",
        keywords: ["terraform", "hcl", "variable", "iac", "infrastructure", "tf"],
        icon: "TF",
        load: lazy("./tools/terraform.js", "variableGenerator"),
    },
    {
        id: "terraform-sg",
        name: "Security Group Rule Generator",
        category: "devops",
        description: "Build Terraform security group rules from a simple form",
        keywords: ["terraform", "security group", "sg", "aws", "firewall", "ingress", "egress"],
        icon: "SG",
        load: lazy("./tools/terraform.js", "securityGroupGenerator"),
    },
    {
        id: "cidr-calculator",
        name: "CIDR Calculator",
        category: "devops",
        description: "Network, broadcast, usable range and masks for any CIDR",
        keywords: ["cidr", "subnet", "network", "mask", "terraform", "vpc", "ip"],
        icon: "/24",
        load: lazy("./tools/network.js", "cidrCalculator"),
    },
    {
        id: "subnet-splitter",
        name: "Subnet Splitter",
        category: "devops",
        description: "Divide a VPC CIDR into evenly sized subnets",
        keywords: ["subnet", "split", "vpc", "cidrsubnet", "terraform", "network"],
        icon: "⊟",
        load: lazy("./tools/network.js", "subnetSplitter"),
    },
    {
        id: "docker-run-compose",
        name: "Docker Run → Compose",
        category: "devops",
        description: "Turn a docker run command into a Compose service",
        keywords: ["docker", "compose", "run", "container", "yaml", "convert"],
        icon: "🐳",
        load: lazy("./tools/docker.js", "runToCompose"),
    },
    {
        id: "docker-image-parser",
        name: "Docker Image Parser",
        category: "devops",
        description: "Split an image reference into registry, repo, tag and digest",
        keywords: ["docker", "image", "tag", "digest", "registry", "ecr", "parse"],
        icon: "IMG",
        load: lazy("./tools/docker.js", "imageParser"),
    },
    {
        id: "k8s-generator",
        name: "Kubernetes YAML Generator",
        category: "devops",
        description: "Generate Deployment, Service, ConfigMap, Secret, Ingress and PVC",
        keywords: ["kubernetes", "k8s", "yaml", "deployment", "service", "ingress", "manifest"],
        icon: "K8s",
        load: lazy("./tools/kubernetes.js", "manifestGenerator"),
    },
    {
        id: "k8s-resource-converter",
        name: "Kubernetes Resource Converter",
        category: "devops",
        description: "Convert CPU and memory resource units used by Kubernetes",
        keywords: ["kubernetes", "cpu", "millicores", "memory", "mi", "gi", "resources"],
        icon: "⇄",
        load: lazy("./tools/kubernetes.js", "resourceConverter"),
    },

    /* --------------------------------------------------------------------- Git */
    {
        id: "git-command-builder",
        name: "Git Command Builder",
        category: "git",
        description: "Build common git commands without memorising flags",
        keywords: ["git", "command", "rebase", "reset", "stash", "cheatsheet"],
        icon: "git",
        load: lazy("./tools/git.js", "commandBuilder"),
    },
    {
        id: "gitignore-generator",
        name: "Gitignore Generator",
        category: "git",
        description: "Combine .gitignore templates for your stack",
        keywords: ["git", "gitignore", "ignore", "template", "python", "node"],
        icon: "⊘",
        load: lazy("./tools/git.js", "gitignoreGenerator"),
    },
    {
        id: "branch-name-generator",
        name: "Branch Name Generator",
        category: "git",
        description: "Create clean, conventional branch names from a summary",
        keywords: ["git", "branch", "name", "slug", "feature", "convention"],
        icon: "⑂",
        load: lazy("./tools/git.js", "branchNameGenerator"),
    },
    {
        id: "commit-message-helper",
        name: "Commit Message Helper",
        category: "git",
        description: "Compose Conventional Commits with scope and footers",
        keywords: ["git", "commit", "conventional", "message", "semver", "changelog"],
        icon: "✎",
        load: lazy("./tools/git.js", "commitMessageHelper"),
    },
    {
        id: "git-diff-stats",
        name: "Git Diff Statistics",
        category: "git",
        description: "Summarise a unified diff by file, additions and deletions",
        keywords: ["git", "diff", "stats", "patch", "insertions", "deletions"],
        icon: "±",
        load: lazy("./tools/diff.js", "gitDiffStats"),
    },

    /* ------------------------------------------------------------------ Python */
    {
        id: "json-to-pydantic",
        name: "JSON → Pydantic",
        category: "python",
        description: "Generate Pydantic v2 models from a JSON sample",
        keywords: ["python", "pydantic", "json", "model", "schema", "basemodel"],
        icon: "py",
        load: lazy("./tools/python.js", "jsonToPydantic"),
    },
    {
        id: "json-to-dataclass",
        name: "JSON → Dataclass",
        category: "python",
        description: "Generate Python dataclasses from a JSON sample",
        keywords: ["python", "dataclass", "json", "typing", "model"],
        icon: "@dc",
        load: lazy("./tools/python.js", "jsonToDataclass"),
    },
    {
        id: "requirements-generator",
        name: "Requirements Generator",
        category: "python",
        description: "Normalise and pin a requirements.txt list",
        keywords: ["python", "pip", "requirements", "pin", "packages", "versions"],
        icon: "≡",
        load: lazy("./tools/python.js", "requirementsGenerator"),
    },
    {
        id: "env-generator",
        name: ".env Generator",
        category: "python",
        description: "Turn key/value pairs into .env and env.example files",
        keywords: ["env", "dotenv", "environment", "variables", "config", "example"],
        icon: "ENV",
        load: lazy("./tools/python.js", "envGenerator"),
    },
    {
        id: "python-dict-formatter",
        name: "Python Dict Formatter",
        category: "python",
        description: "Convert JSON to a formatted Python dict literal",
        keywords: ["python", "dict", "json", "literal", "true", "none", "format"],
        icon: "{…}",
        load: lazy("./tools/python.js", "dictFormatter"),
    },

    /* -------------------------------------------------------------- Networking */
    {
        id: "ipv4-calculator",
        name: "IPv4 Calculator",
        category: "network",
        description: "Inspect an IPv4 address: class, binary, type and masks",
        keywords: ["ip", "ipv4", "binary", "private", "class", "address", "network"],
        icon: "IP",
        load: lazy("./tools/network.js", "ipv4Calculator"),
    },
    {
        id: "port-lookup",
        name: "Port Lookup",
        category: "network",
        description: "Search well-known TCP/UDP ports and services",
        keywords: ["port", "tcp", "udp", "service", "lookup", "firewall"],
        icon: ":80",
        load: lazy("./tools/network.js", "portLookup"),
    },
    {
        id: "http-status-lookup",
        name: "HTTP Status Lookup",
        category: "network",
        description: "Look up HTTP status codes and their meaning",
        keywords: ["http", "status", "code", "404", "500", "rest", "api"],
        icon: "200",
        load: lazy("./tools/network.js", "httpStatusLookup"),
    },
    {
        id: "mac-formatter",
        name: "MAC Address Formatter",
        category: "network",
        description: "Reformat MAC addresses and read the OUI portion",
        keywords: ["mac", "address", "oui", "hardware", "ethernet", "format"],
        icon: "MAC",
        load: lazy("./tools/network.js", "macFormatter"),
    },
    {
        id: "dns-record-helper",
        name: "DNS Record Helper",
        category: "network",
        description: "Build zone file records with the right syntax",
        keywords: ["dns", "record", "zone", "cname", "mx", "txt", "spf", "ttl"],
        icon: "DNS",
        load: lazy("./tools/network.js", "dnsRecordHelper"),
    },

    /* -------------------------------------------------------------------- Text */
    {
        id: "case-converter",
        name: "Case Converter",
        category: "text",
        description: "camelCase, snake_case, kebab-case, Title Case and more",
        keywords: ["case", "camel", "snake", "kebab", "pascal", "constant", "title"],
        icon: "Aa",
        load: lazy("./tools/text.js", "caseConverter"),
    },
    {
        id: "line-processor",
        name: "Line Processor",
        category: "text",
        description: "Sort, dedupe, reverse, number and filter lines",
        keywords: ["lines", "sort", "duplicate", "unique", "reverse", "number", "filter"],
        icon: "1.",
        load: lazy("./tools/text.js", "lineProcessor"),
    },
    {
        id: "whitespace-cleaner",
        name: "Whitespace Cleaner",
        category: "text",
        description: "Trim, collapse and normalise whitespace and line endings",
        keywords: ["whitespace", "trim", "tabs", "spaces", "crlf", "clean"],
        icon: "␣",
        load: lazy("./tools/text.js", "whitespaceCleaner"),
    },
    {
        id: "text-counter",
        name: "Text Counter",
        category: "text",
        description: "Characters, words, lines, sentences and reading time",
        keywords: ["count", "words", "characters", "lines", "reading time", "stats"],
        icon: "123",
        load: lazy("./tools/text.js", "textCounter"),
    },
    {
        id: "slug-generator",
        name: "Slug Generator",
        category: "text",
        description: "Create URL-safe slugs from any text",
        keywords: ["slug", "url", "seo", "permalink", "kebab", "sanitize"],
        icon: "/-/",
        load: lazy("./tools/text.js", "slugGenerator"),
    },
    {
        id: "text-diff",
        name: "Text Diff",
        category: "text",
        description: "Compare two texts line by line",
        keywords: ["diff", "compare", "changes", "merge", "text", "patch"],
        icon: "⇔",
        load: lazy("./tools/diff.js", "textDiff"),
    },

    /* ------------------------------------------------------------- Calculators */
    {
        id: "percentage-calculator",
        name: "Percentage Calculator",
        category: "calc",
        description: "Percentages, increases, decreases and differences",
        keywords: ["percent", "percentage", "increase", "decrease", "change", "ratio"],
        icon: "%",
        load: lazy("./tools/calculators.js", "percentageCalculator"),
    },
    {
        id: "emi-calculator",
        name: "EMI Calculator",
        category: "calc",
        description: "Loan EMI, total interest and repayment schedule summary",
        keywords: ["emi", "loan", "interest", "mortgage", "finance", "installment"],
        icon: "₹",
        load: lazy("./tools/calculators.js", "emiCalculator"),
    },
    {
        id: "age-calculator",
        name: "Age Calculator",
        category: "calc",
        description: "Exact age in years, months, days and total units",
        keywords: ["age", "birthday", "years", "date", "born", "dob"],
        icon: "🎂",
        load: lazy("./tools/calculators.js", "ageCalculator"),
    },
    {
        id: "date-difference",
        name: "Date Difference",
        category: "calc",
        description: "Days between dates, business days and date arithmetic",
        keywords: ["date", "difference", "days", "between", "business days", "add"],
        icon: "📅",
        load: lazy("./tools/calculators.js", "dateDifference"),
    },
    {
        id: "date-add-subtract",
        name: "Date Add / Subtract",
        category: "calc",
        description: "Add or subtract years, months, days and hours from a date",
        keywords: ["date", "add", "subtract", "minus", "plus", "deadline", "due date", "business days"],
        icon: "±📅",
        load: lazy("./tools/calculators.js", "dateAddSubtract"),
    },
    {
        id: "time-duration",
        name: "Time Duration",
        category: "calc",
        description: "Add durations and convert between time units",
        keywords: ["time", "duration", "hours", "minutes", "seconds", "convert"],
        icon: "⏲",
        load: lazy("./tools/calculators.js", "timeDuration"),
    },
    {
        id: "data-size-converter",
        name: "Data Size Converter",
        category: "calc",
        description: "Convert bytes, KiB/MiB/GiB and KB/MB/GB",
        keywords: ["bytes", "kb", "mb", "gb", "kib", "mib", "size", "storage"],
        icon: "MB",
        load: lazy("./tools/calculators.js", "dataSizeConverter"),
    },
    {
        id: "bandwidth-calculator",
        name: "Bandwidth Calculator",
        category: "calc",
        description: "Transfer time from file size and link speed",
        keywords: ["bandwidth", "transfer", "speed", "mbps", "download", "time"],
        icon: "⇅",
        load: lazy("./tools/calculators.js", "bandwidthCalculator"),
    },
    {
        id: "unit-converter",
        name: "Unit Converter",
        category: "calc",
        description: "Length, weight, temperature, area and speed conversions",
        keywords: ["unit", "convert", "length", "weight", "temperature", "metric"],
        icon: "⇌",
        load: lazy("./tools/calculators.js", "unitConverter"),
    },

    /* ---------------------------------------------------------------- Security */
    {
        id: "password-generator",
        name: "Password Generator",
        category: "security",
        description: "Generate strong random passwords and passphrases",
        keywords: ["password", "random", "secure", "passphrase", "generator", "entropy"],
        icon: "•••",
        load: lazy("./tools/security.js", "passwordGenerator"),
    },
    {
        id: "password-strength",
        name: "Password Strength Checker",
        category: "security",
        description: "Estimate entropy and crack time — fully offline",
        keywords: ["password", "strength", "entropy", "secure", "check", "weak"],
        icon: "🛡",
        load: lazy("./tools/security.js", "passwordStrength"),
    },
    {
        id: "secret-detector",
        name: "Secret Pattern Detector",
        category: "security",
        description: "Scan text for API keys, tokens and private keys",
        keywords: ["secret", "api key", "token", "leak", "scan", "credentials", "aws"],
        icon: "🔍",
        load: lazy("./tools/security.js", "secretDetector"),
    },
    {
        id: "hex-text",
        name: "Hex ⇄ Text",
        category: "security",
        description: "Convert between hex bytes and UTF-8 text",
        keywords: ["hex", "hexadecimal", "text", "bytes", "convert", "ascii"],
        icon: "0x",
        load: lazy("./tools/encoding.js", "hexTool"),
    },
    {
        id: "pem-formatter",
        name: "PEM Formatter",
        category: "security",
        description: "Re-wrap PEM blocks to valid 64-character lines",
        keywords: ["pem", "certificate", "key", "ssl", "tls", "format", "base64"],
        icon: "PEM",
        load: lazy("./tools/security.js", "pemFormatter"),
    },
];

const toolsById = new Map(TOOLS.map((tool) => [tool.id, tool]));
const categoriesById = new Map(CATEGORIES.map((category) => [category.id, category]));

export const getTool = (id) => toolsById.get(id);
export const getCategory = (id) => categoriesById.get(id);
export const getToolsByCategory = (id) => TOOLS.filter((tool) => tool.category === id);
export const getCategoryName = (id) => categoriesById.get(id)?.name ?? id;

/** Ranked substring search across name, description, keywords and category. */
export function searchTools(query, limit = 12) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const terms = needle.split(/\s+/);

    const scored = [];
    for (const tool of TOOLS) {
        const name = tool.name.toLowerCase();
        const description = tool.description.toLowerCase();
        const categoryName = getCategoryName(tool.category).toLowerCase();
        const keywords = tool.keywords.join(" ");

        let score = 0;
        let matchesAll = true;
        for (const term of terms) {
            let termScore = 0;
            if (name.startsWith(term)) termScore = 100;
            else if (name.includes(term)) termScore = 70;
            else if (tool.keywords.some((k) => k === term)) termScore = 60;
            else if (keywords.includes(term)) termScore = 40;
            else if (description.includes(term)) termScore = 25;
            else if (categoryName.includes(term)) termScore = 15;
            else if (tool.id.includes(term)) termScore = 20;

            if (termScore === 0) {
                matchesAll = false;
                break;
            }
            score += termScore;
        }
        if (matchesAll) scored.push({ tool, score });
    }

    return scored
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
        .slice(0, limit)
        .map((entry) => entry.tool);
}
