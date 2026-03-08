const STORAGE_KEY = "podman-gen-state-v2";
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const PLACEHOLDERS = {
    command: "Fill in a name and image to generate a command.",
    quadlet: "Fill in a name and image to generate a Quadlet file.",
    install: "Install steps appear once the required fields are valid."
};

const COMMON_TIMEZONES = [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney"
];

const form = document.getElementById("builder-form");
const commandOutput = document.getElementById("command-output");
const quadletOutput = document.getElementById("quadlet-output");
const installOutput = document.getElementById("install-output");
const validationBox = document.getElementById("validation");
const validationList = document.getElementById("validation-list");
const notesBox = document.getElementById("notes");
const statusBox = document.getElementById("status");

const fields = {
    name: document.getElementById("name"),
    description: document.getElementById("description"),
    image: document.getElementById("image"),
    target: document.getElementById("target"),
    autoupdate: document.getElementById("autoupdate"),
    timezone: document.getElementById("timezone"),
    userns: document.getElementById("userns"),
    restartPolicy: document.getElementById("restartPolicy"),
    timeoutStartSec: document.getElementById("timeoutStartSec"),
    startMode: document.getElementById("startMode"),
    afterUnits: document.getElementById("afterUnits"),
    wantsUnits: document.getElementById("wantsUnits"),
    requiresUnits: document.getElementById("requiresUnits"),
    requiresMountsFor: document.getElementById("requiresMountsFor")
};

const collections = {
    port: document.getElementById("ports"),
    mount: document.getElementById("mounts"),
    env: document.getElementById("envs"),
    label: document.getElementById("labels")
};

const emptyStates = {
    port: document.getElementById("ports-empty"),
    mount: document.getElementById("mounts-empty"),
    env: document.getElementById("envs-empty"),
    label: document.getElementById("labels-empty")
};

const actionButtons = {
    copyCommand: document.querySelector('[data-action="copy-command"]'),
    copyQuadlet: document.querySelector('[data-action="copy-quadlet"]'),
    copyInstall: document.querySelector('[data-action="copy-install"]'),
    downloadQuadlet: document.querySelector('[data-action="download-quadlet"]')
};

let statusTimer = null;

initialize();

function initialize() {
    populateTimezones();
    hydrateForm(loadState());
    document.addEventListener("click", handleClick);
    form.addEventListener("input", handleInputChange);
    form.addEventListener("change", handleInputChange);
    render();
}

function populateTimezones() {
    const datalist = document.getElementById("timezones");
    const fragment = document.createDocumentFragment();
    getTimezones().forEach(timezone => {
        const option = document.createElement("option");
        option.value = timezone;
        fragment.appendChild(option);
    });
    datalist.replaceChildren(fragment);
}

function getTimezones() {
    try {
        if (typeof Intl.supportedValuesOf === "function") {
            return Intl.supportedValuesOf("timeZone");
        }
    } catch (error) {
        // Ignore and use fallback values.
    }
    return COMMON_TIMEZONES;
}

function getBrowserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (error) {
        return "";
    }
}

function defaultState() {
    return {
        name: "",
        description: "",
        image: "",
        target: "rootless",
        autoupdate: "disabled",
        timezone: getBrowserTimezone(),
        userns: "",
        restartPolicy: "on-failure",
        timeoutStartSec: "900",
        startMode: "enabled",
        afterUnits: "",
        wantsUnits: "",
        requiresUnits: "",
        requiresMountsFor: "",
        ports: [],
        mounts: [],
        envs: [],
        labels: []
    };
}

function loadState() {
    const fallback = defaultState();
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (!saved || typeof saved !== "object") {
            return fallback;
        }
        return {
            ...fallback,
            ...saved,
            ports: Array.isArray(saved.ports) ? saved.ports : fallback.ports,
            mounts: Array.isArray(saved.mounts) ? saved.mounts : fallback.mounts,
            envs: Array.isArray(saved.envs) ? saved.envs : fallback.envs,
            labels: Array.isArray(saved.labels) ? saved.labels : fallback.labels
        };
    } catch (error) {
        return fallback;
    }
}

function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        // Ignore persistence failures.
    }
}

function hydrateForm(state) {
    fields.name.value = state.name || "";
    fields.description.value = state.description || "";
    fields.image.value = state.image || "";
    fields.target.value = state.target || "rootless";
    fields.autoupdate.value = state.autoupdate || "disabled";
    fields.timezone.value = state.timezone || "";
    fields.userns.value = state.userns || "";
    fields.restartPolicy.value = state.restartPolicy || "on-failure";
    fields.timeoutStartSec.value = state.timeoutStartSec || "900";
    fields.startMode.value = state.startMode || "enabled";
    fields.afterUnits.value = state.afterUnits || "";
    fields.wantsUnits.value = state.wantsUnits || "";
    fields.requiresUnits.value = state.requiresUnits || "";
    fields.requiresMountsFor.value = state.requiresMountsFor || "";

    Object.values(collections).forEach(container => {
        container.replaceChildren();
    });

    state.ports.forEach(port => addRow("port", port));
    state.mounts.forEach(mount => addRow("mount", mount));
    state.envs.forEach(env => addRow("env", env));
    state.labels.forEach(label => addRow("label", label));

    Object.keys(emptyStates).forEach(updateEmptyState);
}

function handleInputChange(event) {
    if (event.target.matches('[data-field="type"]')) {
        syncMountRow(event.target.closest(".item-card"));
    }
    render();
}

function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
        return;
    }

    if (button.dataset.add) {
        event.preventDefault();
        addRow(button.dataset.add);
        render();
        return;
    }

    if (button.hasAttribute("data-remove")) {
        event.preventDefault();
        const row = button.closest(".item-card");
        const kind = row ? row.dataset.kind : "";
        if (row) {
            row.remove();
        }
        if (kind) {
            updateEmptyState(kind);
        }
        render();
        return;
    }

    switch (button.dataset.action) {
        case "load-example":
            event.preventDefault();
            hydrateForm(exampleState());
            setStatus("Loaded example configuration.");
            render();
            break;
        case "reset-form":
            event.preventDefault();
            hydrateForm(defaultState());
            setStatus("Reset the form.");
            render();
            break;
        case "use-browser-timezone":
            event.preventDefault();
            fields.timezone.value = getBrowserTimezone();
            render();
            break;
        case "add-project-label":
            event.preventDefault();
            addProjectLabel();
            render();
            break;
        case "copy-command":
            event.preventDefault();
            copyOutput(commandOutput.textContent, "Copied podman command.");
            break;
        case "copy-quadlet":
            event.preventDefault();
            copyOutput(quadletOutput.textContent, "Copied Quadlet file.");
            break;
        case "copy-install":
            event.preventDefault();
            copyOutput(installOutput.textContent, "Copied install steps.");
            break;
        case "download-quadlet":
            event.preventDefault();
            downloadQuadlet();
            break;
        default:
            break;
    }
}

function addRow(kind, values = {}) {
    const template = document.getElementById(kind + "-template");
    const node = template.content.firstElementChild.cloneNode(true);

    Object.entries(values).forEach(([key, value]) => {
        const field = node.querySelector('[data-field="' + key + '"]');
        if (field) {
            field.value = value;
        }
    });

    collections[kind].appendChild(node);

    if (kind === "mount") {
        syncMountRow(node);
    }

    updateEmptyState(kind);
    return node;
}

function addProjectLabel() {
    const currentLabels = collectCollection("label", readLabelRow, isBlankPairRow);
    const hasProject = currentLabels.some(label => label.key === "project");
    if (!hasProject) {
        addRow("label", { key: "project", value: "homelab" });
        setStatus("Added project label.");
    }
}

function updateEmptyState(kind) {
    emptyStates[kind].hidden = collections[kind].children.length > 0;
}

function syncMountRow(row) {
    if (!row) {
        return;
    }

    const type = getRowValue(row, "type");
    const sourceField = row.querySelector("[data-source-field]");
    const sourceInput = row.querySelector('[data-field="source"]');
    const optionsInput = row.querySelector('[data-field="options"]');
    const hint = row.querySelector(".mount-hint");

    if (type === "tmpfs") {
        sourceField.classList.add("hidden");
        sourceInput.value = "";
        optionsInput.placeholder = "size=1g,mode=1777";
        hint.innerHTML = "Tmpfs uses <code>destination[:options]</code>, for example <code>/cache:size=1g,mode=1777</code>.";
        return;
    }

    sourceField.classList.remove("hidden");

    if (type === "bind") {
        sourceInput.placeholder = "/srv/app/data";
        optionsInput.placeholder = "ro,Z";
        hint.innerHTML = "Bind mounts use <code>/host/path:/container/path[:options]</code>. Put SELinux flags like <code>Z</code> or <code>z</code> in options when needed.";
        return;
    }

    sourceInput.placeholder = "app-data";
    optionsInput.placeholder = "ro";
    hint.innerHTML = "Named volumes use <code>volume-name:/container/path[:options]</code>.";
}

function collectState() {
    return {
        name: fields.name.value.trim(),
        description: fields.description.value.trim(),
        image: fields.image.value.trim(),
        target: fields.target.value,
        autoupdate: fields.autoupdate.value,
        timezone: fields.timezone.value.trim(),
        userns: fields.userns.value,
        restartPolicy: fields.restartPolicy.value,
        timeoutStartSec: fields.timeoutStartSec.value.trim(),
        startMode: fields.startMode.value,
        afterUnits: fields.afterUnits.value.trim(),
        wantsUnits: fields.wantsUnits.value.trim(),
        requiresUnits: fields.requiresUnits.value.trim(),
        requiresMountsFor: fields.requiresMountsFor.value.trim(),
        ports: collectCollection("port", readPortRow, isBlankPortRow),
        mounts: collectCollection("mount", readMountRow, isBlankMountRow),
        envs: collectCollection("env", readPairRow, isBlankPairRow),
        labels: collectCollection("label", readLabelRow, isBlankPairRow)
    };
}

function collectCollection(kind, reader, isBlank) {
    return Array.from(collections[kind].children)
        .map(reader)
        .filter(item => !isBlank(item));
}

function readPortRow(row) {
    return {
        hostIp: getRowValue(row, "hostIp"),
        hostPort: getRowValue(row, "hostPort"),
        containerPort: getRowValue(row, "containerPort"),
        protocol: getRowValue(row, "protocol") || "tcp"
    };
}

function readMountRow(row) {
    return {
        type: getRowValue(row, "type") || "bind",
        source: getRowValue(row, "source"),
        destination: getRowValue(row, "destination"),
        options: getRowValue(row, "options")
    };
}

function readPairRow(row) {
    return {
        key: getRowValue(row, "key"),
        value: getRowValue(row, "value")
    };
}

function readLabelRow(row) {
    return readPairRow(row);
}

function getRowValue(row, key) {
    const field = row.querySelector('[data-field="' + key + '"]');
    return field ? field.value.trim() : "";
}

function isBlankPortRow(row) {
    return !row.hostIp && !row.hostPort && !row.containerPort;
}

function isBlankMountRow(row) {
    return !row.source && !row.destination && !row.options;
}

function isBlankPairRow(row) {
    return !row.key && !row.value;
}

function render() {
    const state = collectState();
    saveState(state);

    const result = buildResult(state);
    renderValidation(result.errors);
    renderNotes(result.notes);

    commandOutput.textContent = result.command || PLACEHOLDERS.command;
    quadletOutput.textContent = result.quadlet || PLACEHOLDERS.quadlet;
    installOutput.textContent = result.install || PLACEHOLDERS.install;

    actionButtons.copyCommand.disabled = !result.valid;
    actionButtons.copyQuadlet.disabled = !result.valid;
    actionButtons.copyInstall.disabled = !result.valid;
    actionButtons.downloadQuadlet.disabled = !result.valid;
}

function buildResult(state) {
    const errors = [];
    const notes = [];

    if (!state.name) {
        errors.push("Name is required.");
    } else if (!NAME_PATTERN.test(state.name)) {
        errors.push("Name should start with a letter or number and only use letters, numbers, dots, dashes, or underscores.");
    }

    if (!state.image) {
        errors.push("Image reference is required.");
    }

    if (state.timeoutStartSec && !/^\d+$/.test(state.timeoutStartSec)) {
        errors.push("Quadlet startup timeout must be a whole number of seconds.");
    }

    state.ports.forEach((port, index) => {
        if (!port.containerPort) {
            errors.push("Port " + (index + 1) + " needs a container port.");
        }
    });

    state.mounts.forEach((mount, index) => {
        if (!mount.destination) {
            errors.push("Mount " + (index + 1) + " needs a destination path.");
        }
        if (mount.type !== "tmpfs" && !mount.source) {
            errors.push("Mount " + (index + 1) + " needs a source for bind or volume mounts.");
        }
    });

    state.envs.forEach((env, index) => {
        if (!env.key || !env.value) {
            errors.push("Environment row " + (index + 1) + " needs both a variable and a value.");
        }
    });

    state.labels.forEach((label, index) => {
        if (!label.key || !label.value) {
            errors.push("Label row " + (index + 1) + " needs both a key and a value.");
        }
    });

    if (errors.length > 0) {
        return {
            valid: false,
            errors,
            notes: [],
            command: "",
            quadlet: "",
            install: ""
        };
    }

    const imageInfo = normalizeImageReference(state.image);

    if (imageInfo.changed) {
        notes.push("Image normalized to " + imageInfo.normalized + " for explicit output.");
    }

    if (state.autoupdate !== "disabled") {
        notes.push("Auto-update only applies when the container runs under systemd. Enable podman-auto-update.timer after installing the Quadlet.");
    }

    if (state.autoupdate === "registry" && !imageInfo.hasExplicitTagOrDigest) {
        notes.push("Registry auto-update is safer with an explicit tag or digest instead of an implicit latest.");
    }

    if (state.target === "rootless") {
        notes.push("Rootless Quadlet units belong under ~/.config/containers/systemd/ and should be managed with systemctl --user.");
        notes.push("For rootless containers, create the user and install the unit in a rootless search path instead of trying to use systemd User= or Group=.");
    }

    if (!state.timezone) {
        notes.push("Timezone is omitted, so the container will use the host default.");
    }

    if (state.userns === "keep-id") {
        notes.push("keep-id is often useful with bind mounts, but some images expect to run as their baked-in container user.");
    }

    if (state.startMode === "manual") {
        notes.push("Manual start mode omits [Install], so the generated install steps use start instead of enable --now.");
    }

    if (state.afterUnits || state.wantsUnits || state.requiresUnits || state.requiresMountsFor) {
        notes.push("The startup dependency fields only affect the Quadlet file and install hints. The podman run command stays independent.");
    }

    if (state.mounts.some(mount => mount.type !== "tmpfs" && mount.source.startsWith("."))) {
        notes.push("Relative mount sources are resolved differently: Quadlet treats them as relative to the unit file, while podman run treats them as relative to the current shell directory.");
    }

    return {
        valid: true,
        errors: [],
        notes: dedupeNotes(notes),
        command: renderCommand(state, imageInfo),
        quadlet: renderQuadlet(state, imageInfo),
        install: renderInstall(state)
    };
}

function normalizeImageReference(raw) {
    const image = raw.trim();
    if (!image) {
        return {
            normalized: "",
            changed: false,
            hasExplicitTagOrDigest: false
        };
    }

    const digestIndex = image.indexOf("@");
    const nameOnly = digestIndex === -1 ? image : image.slice(0, digestIndex);
    const digest = digestIndex === -1 ? "" : image.slice(digestIndex);
    const parts = nameOnly.split("/");
    const firstPart = parts[0];
    const hasRegistry = parts.length > 1 && (firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost");

    let normalized = image;
    if (!hasRegistry) {
        const dockerHubPath = parts.length === 1 ? ["library", parts[0]] : parts;
        normalized = "docker.io/" + dockerHubPath.join("/") + digest;
    }

    const lastSegment = nameOnly.split("/").pop() || "";
    const hasExplicitTagOrDigest = image.includes("@") || /:[^/]+$/.test(lastSegment);

    return {
        normalized,
        changed: normalized !== image,
        hasExplicitTagOrDigest
    };
}

function renderCommand(state, imageInfo) {
    const lines = ["podman run", "  --detach", "  --name " + shellQuote(state.name)];

    if (state.restartPolicy !== "none") {
        lines.push("  --restart " + shellQuote(state.restartPolicy));
    }

    if (state.userns) {
        lines.push("  --userns " + shellQuote(state.userns));
    }

    if (state.timezone) {
        lines.push("  --tz " + shellQuote(state.timezone));
    }

    if (state.autoupdate !== "disabled") {
        lines.push("  --label " + shellQuote("io.containers.autoupdate=" + state.autoupdate));
    }

    state.labels.forEach(label => {
        lines.push("  --label " + shellQuote(label.key + "=" + label.value));
    });

    state.ports.forEach(port => {
        lines.push("  --publish " + shellQuote(formatPort(port)));
    });

    state.mounts.forEach(mount => {
        if (mount.type === "tmpfs") {
            lines.push("  --tmpfs " + shellQuote(formatTmpfs(mount)));
            return;
        }
        lines.push("  --volume " + shellQuote(formatVolume(mount)));
    });

    state.envs.forEach(env => {
        lines.push("  --env " + shellQuote(env.key + "=" + env.value));
    });

    lines.push("  " + shellQuote(imageInfo.normalized));
    return lines.join(" \\\n");
}

function renderQuadlet(state, imageInfo) {
    const description = sanitizeInlineValue(state.description || state.name + " container");
    const afterUnits = parseListField(state.afterUnits);
    const wantsUnits = parseListField(state.wantsUnits);
    const requiresUnits = parseListField(state.requiresUnits);
    const requiresMountsFor = parseListField(state.requiresMountsFor);
    const lines = [
        "[Unit]",
        "Description=" + description
    ];

    afterUnits.forEach(unit => {
        lines.push("After=" + unit);
    });

    wantsUnits.forEach(unit => {
        lines.push("Wants=" + unit);
    });

    requiresUnits.forEach(unit => {
        lines.push("Requires=" + unit);
    });

    if (requiresMountsFor.length > 0) {
        lines.push("RequiresMountsFor=" + requiresMountsFor.join(" "));
    }

    lines.push("", "[Container]",
        "Image=" + imageInfo.normalized,
        "ContainerName=" + state.name);

    if (state.autoupdate !== "disabled") {
        lines.push("AutoUpdate=" + state.autoupdate);
    }

    if (state.timezone) {
        lines.push("Timezone=" + state.timezone);
    }

    if (state.userns) {
        lines.push("UserNS=" + state.userns);
    }

    state.ports.forEach(port => {
        lines.push("PublishPort=" + formatPort(port));
    });

    state.mounts.forEach(mount => {
        if (mount.type === "tmpfs") {
            lines.push("Tmpfs=" + formatTmpfs(mount));
            return;
        }
        lines.push("Volume=" + formatVolume(mount));
    });

    state.envs.forEach(env => {
        lines.push("Environment=" + systemdQuote(env.key + "=" + env.value));
    });

    state.labels.forEach(label => {
        lines.push("Label=" + systemdQuote(label.key + "=" + label.value));
    });

    lines.push("", "[Service]");

    if (state.restartPolicy !== "none") {
        lines.push("Restart=" + state.restartPolicy);
    }

    if (state.timeoutStartSec) {
        lines.push("TimeoutStartSec=" + state.timeoutStartSec);
    }

    if (state.startMode === "enabled") {
        lines.push("", "[Install]");
        lines.push("WantedBy=" + (state.target === "rootful" ? "multi-user.target" : "default.target"));
    }

    return lines.join("\n");
}

function renderInstall(state) {
    const filename = state.name + ".container";
    const startCommand = state.target === "rootful"
        ? "sudo systemctl start " + state.name + ".service"
        : "systemctl --user start " + state.name + ".service";
    const enableCommand = state.target === "rootful"
        ? "sudo systemctl enable --now " + state.name + ".service"
        : "systemctl --user enable --now " + state.name + ".service";

    if (state.target === "rootful") {
        const lines = [
            "Path: /etc/containers/systemd/" + filename,
            "",
            "sudo mkdir -p /etc/containers/systemd",
            "# write " + filename + " to the path above",
            "sudo systemctl daemon-reload"
        ];

        lines.push(state.startMode === "enabled" ? enableCommand : startCommand);

        if (state.autoupdate !== "disabled") {
            lines.push("sudo systemctl enable --now podman-auto-update.timer");
        }

        return lines.join("\n");
    }

    const lines = [
        "Path: ~/.config/containers/systemd/" + filename,
        "",
        "mkdir -p ~/.config/containers/systemd",
        "# write " + filename + " to the path above",
        "systemctl --user daemon-reload"
    ];

    lines.push(state.startMode === "enabled" ? enableCommand : startCommand);

    if (state.autoupdate !== "disabled") {
        lines.push("systemctl --user enable --now podman-auto-update.timer");
    }

    lines.push("# optional: keep the user unit alive after logout");
    lines.push("loginctl enable-linger $USER");
    return lines.join("\n");
}

function formatPort(port) {
    let value = port.containerPort;

    if (port.hostPort) {
        value = port.hostPort + ":" + port.containerPort;
    }

    if (port.hostIp) {
        value = port.hostIp + ":" + (port.hostPort ? port.hostPort : "") + ":" + port.containerPort;
        value = value.replace(":::", "::");
    }

    return value + "/" + port.protocol;
}

function formatVolume(mount) {
    const base = mount.source + ":" + mount.destination;
    return mount.options ? base + ":" + mount.options : base;
}

function formatTmpfs(mount) {
    return mount.options ? mount.destination + ":" + mount.options : mount.destination;
}

function sanitizeInlineValue(value) {
    return value.replace(/\s+/g, " ").trim();
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function systemdQuote(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function dedupeNotes(notes) {
    return Array.from(new Set(notes));
}

function parseListField(value) {
    return Array.from(
        new Set(
            value
                .split(/[\s,]+/)
                .map(item => item.trim())
                .filter(Boolean)
        )
    );
}

function renderValidation(errors) {
    validationList.replaceChildren();
    validationBox.hidden = errors.length === 0;

    errors.forEach(error => {
        const item = document.createElement("li");
        item.textContent = error;
        validationList.appendChild(item);
    });
}

function renderNotes(notes) {
    notesBox.replaceChildren();

    const messages = notes.length > 0 ? notes : ["No warnings. Output is ready to copy."];
    messages.forEach(message => {
        const paragraph = document.createElement("p");
        paragraph.className = "hint";
        paragraph.textContent = message;
        notesBox.appendChild(paragraph);
    });
}

async function copyOutput(text, successMessage) {
    if (!text || text.startsWith("Fill in") || text.startsWith("Install steps appear")) {
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        setStatus(successMessage);
        return;
    } catch (error) {
        // Fall through to the legacy copy path.
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    setStatus(successMessage);
}

function downloadQuadlet() {
    const state = collectState();
    const result = buildResult(state);

    if (!result.valid) {
        return;
    }

    const blob = new Blob([result.quadlet], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = state.name + ".container";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded " + state.name + ".container.");
}

function setStatus(message) {
    clearTimeout(statusTimer);
    statusBox.textContent = message;
    if (!message) {
        return;
    }
    statusTimer = setTimeout(() => {
        if (statusBox.textContent === message) {
            statusBox.textContent = "";
        }
    }, 2600);
}

function exampleState() {
    return {
        name: "jellyfin",
        description: "Jellyfin media server",
        image: "docker.io/jellyfin/jellyfin:latest",
        target: "rootless",
        autoupdate: "registry",
        timezone: getBrowserTimezone() || "America/Los_Angeles",
        userns: "keep-id",
        restartPolicy: "on-failure",
        timeoutStartSec: "900",
        startMode: "enabled",
        afterUnits: "local-fs.target",
        wantsUnits: "",
        requiresUnits: "",
        requiresMountsFor: "/srv/jellyfin/config /srv/jellyfin/cache",
        ports: [
            {
                hostIp: "",
                hostPort: "8096",
                containerPort: "8096",
                protocol: "tcp"
            }
        ],
        mounts: [
            {
                type: "bind",
                source: "/srv/jellyfin/config",
                destination: "/config",
                options: "Z"
            },
            {
                type: "bind",
                source: "/srv/jellyfin/cache",
                destination: "/cache",
                options: "Z"
            }
        ],
        envs: [],
        labels: [
            {
                key: "project",
                value: "media"
            }
        ]
    };
}
