/* AI Video Studio v0.2 — local-first project planner */
"use strict";

(() => {
  const STORAGE_KEY = "aivs_v02_data";
  const LEGACY_KEY = "aivs_v01";
  const $ = (id) => document.getElementById(id);

  const defaultData = () => ({
    version: 2,
    projects: [],
    styleBible: { name: "", rules: "", characters: "" },
    settings: { parallelism: 1, aspect: "16:9", resolution: "1920x1080" }
  });

  function normalizeData(raw) {
    const clean = defaultData();
    if (!raw || typeof raw !== "object") return clean;
    clean.projects = Array.isArray(raw.projects) ? raw.projects.map((p) => {
      const tasks = Array.isArray(p.tasks) ? p.tasks : [];
      return {
        id: String(p.id || makeId()),
        title: String(p.title || "Без названия"),
        idea: String(p.idea || p.title || ""),
        createdAt: p.createdAt || p.date || new Date().toISOString(),
        tasks: tasks.map((t, i) => ({
          id: String(t.id || makeId()),
          title: String(t.title || "Задача"),
          worker: String(t.worker || "Не назначен"),
          status: ["waiting", "done", "error", "paused"].includes(t.status) ? t.status : "waiting",
          order: Number.isFinite(Number(t.order ?? t.n)) ? Number(t.order ?? t.n) : i + 1
        }))
      };
    }) : [];
    clean.styleBible = { ...clean.styleBible, ...(raw.styleBible || {}) };
    clean.settings = { ...clean.settings, ...(raw.settings || {}) };
    return clean;
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadData() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return normalizeData(JSON.parse(current));
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        const migrated = normalizeData(JSON.parse(old));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.error("Ошибка чтения сохранённых данных:", error);
    }
    return defaultData();
  }

  let data = loadData();
  let activeProjectId = null;
  let toastTimer = null;

  function persist(showMessage = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (showMessage) notify("Изменения сохранены");
      renderAll();
      return true;
    } catch (error) {
      console.error("Не удалось сохранить данные:", error);
      notify("Не удалось сохранить. Возможно, память браузера заполнена.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function notify(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  const viewNames = {
    home: "Главная", projects: "Мои проекты", projectDetail: "Проект",
    workflow: "Производство", team: "Команда ИИ", queue: "Очередь задач",
    style: "Style Bible", settings: "Настройки"
  };

  function closeMenu() {
    $("sidebar").classList.remove("open");
    $("backdrop").hidden = true;
    $("menuButton").setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  }

  function openMenu() {
    $("sidebar").classList.add("open");
    $("backdrop").hidden = false;
    $("menuButton").setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
  }

  function toggleMenu() {
    $("sidebar").classList.contains("open") ? closeMenu() : openMenu();
  }

  function showView(name) {
    if (!$(name) || !$(name).classList.contains("view")) return;
    document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === name));
    document.querySelectorAll("[data-view]").forEach((el) => el.classList.toggle("active", el.dataset.view === name));
    $("breadcrumb").textContent = viewNames[name] || "AI Video Studio";
    closeMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const workers = [
    ["DeepSeek", "Исследование, поиск и проверка фактов", "Не подключён"],
    ["Claude", "Сценарий, структура и редактура", "Не подключён"],
    ["ChatGPT", "Координация, планирование и контроль качества", "Координатор"],
    ["Генератор изображений", "Иллюстрации, персонажи и кадры", "Не подключён"],
    ["ElevenLabs", "Озвучка и голос", "Не подключён"],
    ["Video Engine", "Монтаж и сборка итогового видео", "Не подключён"]
  ];

  const workflow = [
    ["Исследование", "Собрать факты, источники и важные даты."],
    ["Сценарий", "Подготовить текст, структуру и длительность."],
    ["Style Bible", "Зафиксировать стиль, палитру и внешний вид персонажей."],
    ["Раскадровка", "Разбить сценарий на сцены и описать кадры."],
    ["Иллюстрации", "Создать изображения и проверить визуальную непрерывность."],
    ["Озвучка", "Подготовить голосовую дорожку и синхронизацию."],
    ["Монтаж", "Собрать сцены, звук, переходы и титры."],
    ["Финальная проверка", "Проверить звук, изображение, длительность и экспорт."]
  ];

  function createProject() {
    const input = $("idea");
    const idea = input.value.trim();
    if (!idea) {
      notify("Сначала опиши идею видео");
      input.focus();
      return;
    }
    const project = {
      id: makeId(),
      title: idea.length > 72 ? idea.slice(0, 72).trim() + "…" : idea,
      idea,
      createdAt: new Date().toISOString(),
      tasks: workflow.map((stage, index) => ({
        id: makeId(), title: stage[0] + ": " + stage[1],
        worker: ["DeepSeek", "Claude", "ChatGPT", "ChatGPT", "Генератор изображений", "ElevenLabs", "Video Engine", "ChatGPT"][index],
        status: "waiting", order: index + 1
      }))
    };
    data.projects.unshift(project);
    input.value = "";
    if (persist()) {
      activeProjectId = project.id;
      renderProjectDetail();
      showView("projectDetail");
      notify("Проект создан. Задачи добавлены в очередь.");
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Дата неизвестна" : date.toLocaleDateString("ru-RU");
  }

  function renderProjectCard(project) {
    const done = project.tasks.filter((t) => t.status === "done").length;
    return `<article class="project-card">
      <div class="project-main"><b>${escapeHTML(project.title)}</b>
      <small>${formatDate(project.createdAt)} · ${project.tasks.length} этапов · ${done}/${project.tasks.length} выполнено</small></div>
      <div class="project-actions">
        <button class="small-btn" data-open-project="${escapeHTML(project.id)}">Открыть</button>
        <button class="small-btn" data-delete-project="${escapeHTML(project.id)}">Удалить</button>
      </div></article>`;
  }

  function renderProjectLists() {
    const empty = '<div class="empty-state">Пока проектов нет. Создай первый проект на главной странице.</div>';
    $("recentProjects").innerHTML = data.projects.length ? data.projects.slice(0, 3).map(renderProjectCard).join("") : empty;
    $("projectList").innerHTML = data.projects.length ? data.projects.map(renderProjectCard).join("") : empty;
  }

  function renderProjectDetail() {
    const project = data.projects.find((p) => p.id === activeProjectId);
    if (!project) {
      $("projectDetailContent").innerHTML = '<div class="empty-state">Проект не найден. Возможно, он был удалён.</div>';
      return;
    }
    $("projectDetailContent").innerHTML = `
      <div class="page-heading"><div><div class="eyebrow">ПРОЕКТ</div><h1>${escapeHTML(project.title)}</h1><p>Создан: ${formatDate(project.createdAt)}</p></div></div>
      <div class="detail-block"><h3>Исходная идея</h3><p>${escapeHTML(project.idea)}</p></div>
      <div class="detail-block"><h3>Этапы проекта</h3><p>${project.tasks.length} задач · ${project.tasks.filter(t => t.status === "done").length} выполнено</p></div>
      <div class="stack-list">${project.tasks.map(task => `<div class="task-card"><div class="task-main"><b>${escapeHTML(task.order)}. ${escapeHTML(task.title)}</b><small>Исполнитель: ${escapeHTML(task.worker)}</small></div><span class="task-state">${task.status === "done" ? "ВЫПОЛНЕНО" : task.status === "error" ? "ОШИБКА" : task.status === "paused" ? "ПАУЗА" : "ОЖИДАЕТ ПОДКЛЮЧЕНИЯ"}</span></div>`).join("")}</div>`;
  }

  function renderQueue() {
    const tasks = data.projects.flatMap((p) => p.tasks.map((t) => ({ ...t, projectTitle: p.title })));
    $("statTotal").textContent = tasks.length;
    $("statWaiting").textContent = tasks.filter((t) => t.status === "waiting").length;
    $("statDone").textContent = tasks.filter((t) => t.status === "done").length;
    $("queueList").innerHTML = tasks.length ? tasks.map((t) => `
      <article class="task-card"><div class="task-main"><b>${escapeHTML(t.title)}</b><small>${escapeHTML(t.projectTitle)} · ${escapeHTML(t.worker)}</small></div><span class="task-state">${t.status === "done" ? "ВЫПОЛНЕНО" : t.status === "error" ? "ОШИБКА" : t.status === "paused" ? "ПАУЗА" : "ОЖИДАЕТ ПОДКЛЮЧЕНИЯ"}</span></article>`).join("") : '<div class="empty-state">Очередь пока пуста. Создай проект, чтобы добавить задачи.</div>';
  }

  function renderAll() {
    renderProjectLists();
    renderQueue();
    renderProjectDetail();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-video-studio-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    notify("Резервная копия подготовлена");
  }

  async function importData(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects)) {
        throw new Error("Неверный формат резервной копии");
      }
      if (!confirm("Импорт заменит текущие проекты и Style Bible. Продолжить?")) return;
      data = normalizeData(parsed);
      activeProjectId = null;
      persist();
      showView("projects");
      notify("Резервная копия восстановлена");
    } catch (error) {
      console.error(error);
      notify("Не удалось импортировать файл. Проверь JSON.");
    } finally {
      $("importFile").value = "";
    }
  }

  function saveStyleBible() {
    data.styleBible = {
      name: $("styleName").value.trim(),
      rules: $("styleRules").value.trim(),
      characters: $("characterRules").value.trim()
    };
    persist(true);
  }

  function bindEvents() {
    $("menuButton").addEventListener("click", toggleMenu);
    $("closeMenu").addEventListener("click", closeMenu);
    $("backdrop").addEventListener("click", closeMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) closeMenu();
    });

    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) {
        showView(viewButton.dataset.view);
        return;
      }
      const openButton = event.target.closest("[data-open-project]");
      if (openButton) {
        activeProjectId = openButton.dataset.openProject;
        renderProjectDetail();
        showView("projectDetail");
        return;
      }
      const deleteButton = event.target.closest("[data-delete-project]");
      if (deleteButton) {
        const id = deleteButton.dataset.deleteProject;
        if (!confirm("Удалить этот проект и его задачи?")) return;
        data.projects = data.projects.filter((p) => p.id !== id);
        if (activeProjectId === id) activeProjectId = null;
        persist();
        notify("Проект удалён");
      }
    });

    $("createProject").addEventListener("click", createProject);
    $("idea").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        createProject();
      }
    });
    $("newProject").addEventListener("click", () => {
      showView("home");
      $("idea").focus();
    });
    $("backProjects").addEventListener("click", () => showView("projects"));
    $("saveStyle").addEventListener("click", saveStyleBible);
    $("exportData").addEventListener("click", exportData);
    $("importButton").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", (event) => importData(event.target.files[0]));
    $("clearData").addEventListener("click", () => {
      if (!confirm("Удалить ВСЕ проекты и Style Bible с этого устройства? Это действие нельзя отменить.")) return;
      data = defaultData();
      activeProjectId = null;
      persist();
      $("styleName").value = "";
      $("styleRules").value = "";
      $("characterRules").value = "";
      showView("home");
      notify("Локальные данные очищены");
    });
  }

  function renderStaticSections() {
    $("teamList").innerHTML = workers.map((w) => `
      <article class="team-card"><b>${escapeHTML(w[0])}</b><p>${escapeHTML(w[1])}</p><span class="tag">${escapeHTML(w[2])}</span></article>`).join("");
    $("workflowList").innerHTML = workflow.map((s, i) => `
      <article class="timeline-item"><div class="step-number">${i + 1}</div><div><b>${escapeHTML(s[0])}</b><p>${escapeHTML(s[1])}</p></div></article>`).join("");
    $("styleName").value = data.styleBible.name || "";
    $("styleRules").value = data.styleBible.rules || "";
    $("characterRules").value = data.styleBible.characters || "";
  }

  function init() {
    bindEvents();
    renderStaticSections();
    renderAll();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("PWA cache not registered:", error));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();