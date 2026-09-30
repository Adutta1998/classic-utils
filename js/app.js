"use strict";

/**
 * Application shell: navigation, search, theming, routing and view rendering.
 */

import {
    CATEGORIES, TOOLS, getTool, getCategory, getToolsByCategory, getCategoryName, searchTools,
} from "./registry.js";
import { navigate, onRouteChange, startRouter, toCategoryPath, toToolPath } from "./router.js";
import {
    getFavorites, getRecent, isFavorite, toggleFavorite, pushRecent, clearRecent,
    getThemePreference, setThemePreference, storageEvents, isStorageAvailable,
} from "./storage.js";
import { el, clear, toast, emptyState, button, iconButton, append } from "./ui.js";
import { $, debounce, pluralize } from "./utils.js";

const FEATURED_TOOL_IDS = [
    "json-formatter", "base64", "jwt-decoder", "uuid-generator",
    "timestamp-converter", "cidr-calculator", "regex-tester", "case-converter",
];

const THEME_ORDER = ["light", "dark", "system"];
const THEME_GLYPHS = { light: "☀", dark: "☾", system: "◐" };

const dom = {};
let activeCleanup = null;

/* ========================================================================== */
/* Theme                                                                      */
/* ========================================================================== */

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function resolveTheme(preference) {
    if (preference === "system") return darkQuery.matches ? "dark" : "light";
    return preference;
}

function applyTheme(preference) {
    const resolved = resolveTheme(preference);
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#24272e" : "#e6e9ef");
    if (dom.themeGlyph) dom.themeGlyph.textContent = THEME_GLYPHS[preference];
    dom.themeToggle?.setAttribute("aria-label", `Theme: ${preference}. Click to change.`);
    dom.themeToggle?.setAttribute("title", `Theme: ${preference}`);
}

function initTheme() {
    applyTheme(getThemePreference());
    darkQuery.addEventListener("change", () => {
        if (getThemePreference() === "system") applyTheme("system");
    });
    dom.themeToggle.addEventListener("click", () => {
        const next = THEME_ORDER[(THEME_ORDER.indexOf(getThemePreference()) + 1) % THEME_ORDER.length];
        setThemePreference(next);
        applyTheme(next);
        toast(`Theme: ${next}`, "info", 1500);
    });
}

/* ========================================================================== */
/* Sidebar                                                                    */
/* ========================================================================== */

function navLink({ label, icon, count, path, current }) {
    return el(
        "li",
        {},
        el(
            "button",
            {
                class: "nav-link",
                type: "button",
                "aria-current": current ? "page" : null,
                onClick: () => {
                    navigate(path);
                    closeDrawer();
                },
            },
            el("span", { class: "nav-icon", "aria-hidden": "true", text: icon }),
            el("span", { text: label }),
            count === undefined ? null : el("span", { class: "nav-count", text: String(count) }),
        ),
    );
}

function navGroup(title, items) {
    return el(
        "div",
        {},
        el("h2", { class: "nav-group-title", text: title }),
        append(el("ul", { class: "nav-list" }), items),
    );
}

function renderSidebar(route = { name: "home" }) {
    const inner = clear(dom.sidebarInner);
    const isCategory = (id) => route.name === "category" && route.id === id;
    const activeToolCategory = route.name === "tool" ? getTool(route.id)?.category : null;

    inner.append(navGroup("Browse", [
        navLink({ label: "Dashboard", icon: "⌂", path: "#/", current: route.name === "home" }),
    ]));

    const favorites = getFavorites().map(getTool).filter(Boolean);
    if (favorites.length) {
        inner.append(navGroup("⭐ Favorites", favorites.map((tool) => navLink({
            label: tool.name,
            icon: "★",
            path: toToolPath(tool.id),
            current: route.name === "tool" && route.id === tool.id,
        }))));
    }

    const recent = getRecent().map(getTool).filter(Boolean).slice(0, 5);
    if (recent.length) {
        inner.append(navGroup("🕘 Recent", recent.map((tool) => navLink({
            label: tool.name,
            icon: "·",
            path: toToolPath(tool.id),
            current: route.name === "tool" && route.id === tool.id,
        }))));
    }

    inner.append(navGroup("Categories", CATEGORIES.map((category) => navLink({
        label: category.name,
        icon: category.icon,
        count: getToolsByCategory(category.id).length,
        path: toCategoryPath(category.id),
        current: isCategory(category.id) || activeToolCategory === category.id,
    }))));
}

/* ========================================================================== */
/* Mobile drawer                                                              */
/* ========================================================================== */

function openDrawer() {
    dom.sidebar.classList.add("open");
    dom.scrim.hidden = false;
    requestAnimationFrame(() => dom.scrim.classList.add("open"));
    dom.navToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
}

function closeDrawer() {
    if (!dom.sidebar.classList.contains("open")) return;
    dom.sidebar.classList.remove("open");
    dom.scrim.classList.remove("open");
    setTimeout(() => { dom.scrim.hidden = true; }, 220);
    dom.navToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
}

/* ========================================================================== */
/* Search                                                                     */
/* ========================================================================== */

function initSearch() {
    const { searchInput, searchResults } = dom;
    let activeIndex = -1;
    let results = [];

    const closeResults = () => {
        searchResults.hidden = true;
        searchInput.setAttribute("aria-expanded", "false");
        activeIndex = -1;
    };

    const highlight = () => {
        Array.from(searchResults.children).forEach((node, index) => {
            node.classList.toggle("active", index === activeIndex);
        });
    };

    const open = (tool) => {
        navigate(toToolPath(tool.id));
        searchInput.value = "";
        searchInput.blur();
        closeResults();
        closeDrawer();
    };

    const render = () => {
        clear(searchResults);
        if (!results.length) {
            searchResults.append(el("p", { class: "search-empty", text: "No tools match that search." }));
        } else {
            for (const tool of results) {
                searchResults.append(el(
                    "button",
                    { class: "search-result", type: "button", role: "option", onClick: () => open(tool) },
                    el("span", { class: "sr-icon", "aria-hidden": "true", text: tool.icon }),
                    el(
                        "span",
                        { class: "sr-body" },
                        el("span", { class: "sr-name", text: tool.name }),
                        el("span", { class: "sr-desc", text: tool.description }),
                    ),
                    el("span", { class: "sr-cat", text: getCategoryName(tool.category) }),
                ));
            }
        }
        searchResults.hidden = false;
        searchInput.setAttribute("aria-expanded", "true");
    };

    const runSearch = debounce(() => {
        const query = searchInput.value.trim();
        if (!query) {
            closeResults();
            return;
        }
        results = searchTools(query);
        activeIndex = -1;
        render();
    }, 100);

    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim()) runSearch();
    });

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            searchInput.value = "";
            closeResults();
            searchInput.blur();
            return;
        }
        if (searchResults.hidden || !results.length) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % results.length;
            highlight();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + results.length) % results.length;
            highlight();
        } else if (event.key === "Enter") {
            event.preventDefault();
            open(results[Math.max(activeIndex, 0)]);
        }
    });

    document.addEventListener("click", (event) => {
        if (!dom.headerSearch.contains(event.target)) closeResults();
    });
}

/* ========================================================================== */
/* Views                                                                      */
/* ========================================================================== */

function toolCard(tool) {
    return el(
        "button",
        { class: "tool-card", type: "button", onClick: () => navigate(toToolPath(tool.id)) },
        el(
            "span",
            { class: "tc-top" },
            el("span", { class: "tc-icon", "aria-hidden": "true", text: tool.icon }),
            el("span", { class: "tc-name", text: tool.name }),
        ),
        el("span", { class: "tc-desc", text: tool.description }),
        el("span", { class: "tc-cat", text: getCategoryName(tool.category) }),
    );
}

function section(title, note, content) {
    return el(
        "section",
        { class: "section" },
        el(
            "div",
            { class: "section-head" },
            el("h2", { text: title }),
            note ? el("span", { class: "section-note", text: note }) : null,
        ),
        content,
    );
}

function toolGrid(tools) {
    return append(el("div", { class: "tool-grid" }), tools.map(toolCard));
}

function renderHome(root) {
    const favorites = getFavorites().map(getTool).filter(Boolean);
    const recent = getRecent().map(getTool).filter(Boolean);

    root.append(el(
        "section",
        { class: "hero" },
        el("h1", { text: "DevToolbox" }),
        el("p", { text: "Small tools. Less repetitive work." }),
        el(
            "div",
            { class: "hero-stats" },
            el("span", { class: "badge badge-accent", text: `${TOOLS.length} tools` }),
            el("span", { class: "badge", text: `${CATEGORIES.length} categories` }),
            el("span", { class: "badge badge-success", text: "100% client-side" }),
            el("span", { class: "badge", text: "Works offline" }),
        ),
    ));

    if (favorites.length) {
        root.append(section("⭐ Favorites", pluralize(favorites.length, "tool"), toolGrid(favorites)));
    }

    const featured = FEATURED_TOOL_IDS.map(getTool).filter(Boolean);
    root.append(section("Frequently Used", "Handy starting points", toolGrid(featured)));

    const categoryGrid = append(
        el("div", { class: "category-grid" }),
        CATEGORIES.map((category) => el(
            "button",
            { class: "category-card", type: "button", onClick: () => navigate(toCategoryPath(category.id)) },
            el("span", { class: "cc-icon", "aria-hidden": "true", text: category.icon }),
            el(
                "span",
                {},
                el("span", { class: "cc-name", text: category.name }),
                el("span", { class: "cc-count", text: ` · ${getToolsByCategory(category.id).length}` }),
            ),
        )),
    );
    root.append(section("Categories", "Browse the full toolbox", categoryGrid));

    if (recent.length) {
        const wrapper = el("div", {}, toolGrid(recent));
        wrapper.append(el(
            "div",
            { class: "btn-row", style: { marginTop: "16px" } },
            button("Clear history", {
                variant: "ghost",
                small: true,
                glyph: "⌫",
                onClick: () => {
                    clearRecent();
                    toast("Recent tools cleared", "info");
                },
            }),
        ));
        root.append(section("Recently Used", "Stored locally on this device", wrapper));
    }
}

function renderCategory(root, categoryId) {
    const category = getCategory(categoryId);
    if (!category) {
        root.append(emptyState("Category not found", "Pick another category from the sidebar.", "?"));
        return;
    }
    const tools = getToolsByCategory(categoryId);
    root.append(el(
        "div",
        { class: "breadcrumb" },
        el("button", { type: "button", text: "Dashboard", onClick: () => navigate("#/") }),
        el("span", { "aria-hidden": "true", text: "/" }),
        el("span", { text: category.name }),
    ));
    root.append(section(`${category.icon} ${category.name}`, pluralize(tools.length, "tool"), toolGrid(tools)));
}

function favoriteButton(toolId) {
    const node = el("button", {
        class: "fav-btn",
        type: "button",
        "aria-pressed": String(isFavorite(toolId)),
        "aria-label": "Toggle favorite",
        title: "Add to favorites",
        text: isFavorite(toolId) ? "★" : "☆",
    });
    node.addEventListener("click", () => {
        const added = toggleFavorite(toolId);
        node.setAttribute("aria-pressed", String(added));
        node.textContent = added ? "★" : "☆";
        toast(added ? "Added to favorites" : "Removed from favorites", "success", 1600);
    });
    return node;
}

async function renderTool(root, toolId) {
    const tool = getTool(toolId);
    if (!tool) {
        root.append(emptyState("Tool not found", "It may have been renamed. Try the search above.", "?"));
        return;
    }

    document.title = `${tool.name} — DevToolbox`;
    pushRecent(tool.id);

    root.append(el(
        "div",
        { class: "breadcrumb" },
        el("button", { type: "button", text: "Dashboard", onClick: () => navigate("#/") }),
        el("span", { "aria-hidden": "true", text: "/" }),
        el("button", {
            type: "button",
            text: getCategoryName(tool.category),
            onClick: () => navigate(toCategoryPath(tool.category)),
        }),
    ));

    root.append(el(
        "header",
        { class: "tool-header" },
        el("span", { class: "th-icon", "aria-hidden": "true", text: tool.icon }),
        el(
            "div",
            { class: "th-body" },
            el("h1", { text: tool.name }),
            el("p", { text: tool.description }),
        ),
        favoriteButton(tool.id),
    ));

    const host = el("div", {});
    root.append(host);

    try {
        const render = await tool.load();
        if (typeof render !== "function") throw new Error("Tool module did not export a render function");
        activeCleanup = render(host, { tool }) ?? null;
    } catch (error) {
        console.error(`Failed to load tool "${tool.id}"`, error);
        clear(host).append(emptyState(
            "This tool failed to load",
            "Reload the page and try again. If you opened the files directly, serve them over HTTP instead.",
            "⚠",
        ));
    }
}

function renderRoute(route) {
    if (typeof activeCleanup === "function") {
        try { activeCleanup(); } catch { /* ignore cleanup failures */ }
    }
    activeCleanup = null;

    const root = clear(dom.viewRoot);
    document.title = "DevToolbox — Lightweight Developer Utilities";

    if (route.name === "tool") renderTool(root, route.id);
    else if (route.name === "category") renderCategory(root, route.id);
    else renderHome(root);

    renderSidebar(route);
    window.scrollTo({ top: 0, behavior: "auto" });
    dom.toolArea.focus({ preventScroll: true });
}

/* ========================================================================== */
/* Global shortcuts + bootstrap                                               */
/* ========================================================================== */

function initShortcuts() {
    document.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            dom.searchInput.focus();
            dom.searchInput.select();
            return;
        }
        if (event.key === "Escape") closeDrawer();
        if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "")) {
            event.preventDefault();
            dom.searchInput.focus();
        }
    });
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!["https:", "http:"].includes(window.location.protocol)) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register(new URL("service-worker.js", document.baseURI))
            .catch((error) => console.warn("Service worker registration failed", error));
    });
}

export function bootstrap() {
    Object.assign(dom, {
        sidebar: $("#sidebar"),
        sidebarInner: $("#sidebar-inner"),
        viewRoot: $("#view-root"),
        toolArea: $("#tool-area"),
        scrim: $("#scrim"),
        navToggle: $("#nav-toggle"),
        themeToggle: $("#theme-toggle"),
        themeGlyph: $("#theme-glyph"),
        searchInput: $("#global-search"),
        searchResults: $("#search-results"),
        headerSearch: $(".header-search"),
    });

    initTheme();
    initSearch();
    initShortcuts();

    dom.navToggle.addEventListener("click", () => {
        if (dom.sidebar.classList.contains("open")) closeDrawer();
        else openDrawer();
    });
    dom.scrim.addEventListener("click", closeDrawer);

    let currentRoute = { name: "home" };
    storageEvents.addEventListener("favorites", () => renderSidebar(currentRoute));
    storageEvents.addEventListener("recent", () => renderSidebar(currentRoute));

    onRouteChange((route) => {
        currentRoute = route;
        renderRoute(route);
    });

    window.addEventListener("error", (event) => {
        console.error("Unhandled error", event.error ?? event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
        console.error("Unhandled promise rejection", event.reason);
    });

    if (!isStorageAvailable()) {
        toast("Local storage is unavailable — favourites will not persist", "warning", 4000);
    }

    startRouter();
    registerServiceWorker();
}
