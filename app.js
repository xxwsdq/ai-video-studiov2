/* AI Video Studio v0.2 — local-first project planner */
"use strict";

(() => {
  const STORAGE_KEY = "aivs_v02_data";
  const LEGACY_KEY = "aivs_v01";
  const $ = (id) => document.getElementById(id);

  const defaultData = () => ({
    version: 3,
    projects: [],
    styleBible: { name: "", rules: "", characters: "" },
    members: [
      { id: "chatgpt", name: "ChatGPT", role: "Координация, планирование и контроль качества", url: "https://chatgpt.com" },
      { id: "deepseek", name: "DeepSeek", role: "Исследование, анализ и поиск идей", url: "https://chat.deepseek.com" },
      { id: "claude", name: "Claude", role: "Сценарии, структура и редактура", url: "https://claude.ai" }
    ],
    handoffs: [],
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
    clean.members = Array.isArray(raw.members) ? raw.members.map(m => ({ id: String(m.id || makeId()), name: String(m.name || "ИИ"), role: String(m.role || "Исполнитель"), url: safeHttpUrl(m.url) })) : clean.members;
    clean.handoffs = Array.isArray(raw.handoffs) ? raw.handoffs.map(h => ({ id: String(h.id || makeId()), projectId: String(h.projectId || ""), projectTitle: String(h.projectTitle || "Проект"), memberId: String(h.memberId || ""), memberName: String(h.memberName || "ИИ"), title: String(h.title || "Задание"), details: String(h.details || ""), prompt: String(h.prompt || ""), result: String(h.result || ""), status: h.status === "done" ? "done" : "waiting", createdAt: h.createdAt || new Date().toISOString() })) : [];
    clean.settings = { ...clean.settings, ...(raw.settings || {}) };
    return clean;
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function safeHttpUrl(value) {
    try { const u = new URL(String(value || "")); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; }
    catch (_) { return ""; }
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
  let activeHandoffId = null;
  // Токен хранится только в памяти текущей страницы и не записывается в localStorage.
  let studioToken = "";
  const AI_BRAIN_URL = "https://ai-video-brain.tolasovalihan9.workers.dev";

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
    renderTeam();
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

  function installGemmaPanel() {
    if ($("gemmaPanel")) return;
    const teamList = $("teamList");
    if (!teamList) return;
    teamList.insertAdjacentHTML("beforebegin", `
      <section class="panel form-panel" id="gemmaPanel" style="margin:18px 0">
        <div class="section-heading"><h2>✦ Gemma · AI Video Brain</h2><span class="tag">ПОДКЛЮЧЕНА</span></div>
        <p class="muted">Напиши задачу — Gemma ответит прямо здесь. Токен не сохраняется и будет забыт после закрытия или обновления страницы.</p>
        <label for="gemmaPrompt">Сообщение для ИИ</label>
        <textarea id="gemmaPrompt" rows="4" maxlength="2800" placeholder="Например: предложи 3 короткие идеи для исторического ролика на YouTube..."></textarea>
        <button class="primary-btn" id="gemmaSend">Отправить Gemma</button>
        <div id="gemmaStatus" class="muted" role="status" style="margin-top:10px"></div>
        <div id="gemmaAnswer" class="detail-block" style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px" hidden></div>
      </section>
    `);
    $("gemmaSend").addEventListener("click", sendToGemma);
  }

  async function sendToGemma() {
    const prompt = $("gemmaPrompt").value.trim();
    if (!prompt) return notify("Сначала напиши задание для Gemma");
    if (!studioToken) {
      const entered = window.prompt("Вставь STUDIO_TOKEN из настроек Cloudflare Worker. Не отправляй его в чат и никому не показывай.");
      if (!entered || !entered.trim()) return notify("Токен не введён");
      studioToken = entered.trim();
    }

    const button = $("gemmaSend");
    const status = $("gemmaStatus");
    const answer = $("gemmaAnswer");
    button.disabled = true;
    status.textContent = "Gemma думает…";
    answer.hidden = true;
    answer.textContent = "";

    try {
      const response = await fetch(AI_BRAIN_URL + "/ai/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + studioToken
        },
        body: JSON.stringify({
          prompt: "Отвечай по-русски. Будь краткой и конкретной: максимум 5 коротких пунктов или 120 слов, если не попросили подробно. Не повторяй задачу.\n\nЗАДАНИЕ:\n" + prompt
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        if (response.status === 401) studioToken = "";
        throw new Error(payload.message || payload.error || ("HTTP " + response.status));
      }
      const result = payload.result;
      answer.textContent = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      answer.hidden = false;
      status.textContent = "Готово · " + (payload.model || "Gemma");
    } catch (error) {
      status.textContent = "Не удалось получить ответ: " + error.message;
      if (/Failed to fetch|NetworkError/i.test(error.message)) status.textContent += " Проверь интернет и доступность Worker.";
    } finally {
      button.disabled = false;
    }
  }

  function renderTeam() {
    const list = data.members;
    $("teamList").innerHTML = list.length ? list.map(m => `
      <article class="team-card">
        <div class="team-card-top"><b>${escapeHTML(m.name)}</b><button class="small-btn" data-remove-member="${escapeHTML(m.id)}">Убрать</button></div>
        <p>${escapeHTML(m.role)}</p><span class="tag">${m.url ? "САЙТ ДОБАВЛЕН" : "БЕЗ ССЫЛКИ"}</span>
        ${m.url ? `<a class="worker-link" href="${escapeHTML(m.url)}" target="_blank" rel="noopener noreferrer">Открыть ${escapeHTML(m.name)} ↗</a>` : ""}
      </article>`).join("") : '<div class="empty-state">Добавь первого исполнителя.</div>';
    const projectSelect = $("assignProject");
    const oldProject = projectSelect.value;
    projectSelect.innerHTML = data.projects.length ? data.projects.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.title)}</option>`).join("") : '<option value="">Сначала создай проект</option>';
    if (data.projects.some(p => p.id === oldProject)) projectSelect.value = oldProject;
    const memberSelect = $("assignMember");
    const oldMember = memberSelect.value;
    memberSelect.innerHTML = list.length ? list.map(m => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)} — ${escapeHTML(m.role)}</option>`).join("") : '<option value="">Сначала добавь ИИ</option>';
    if (list.some(m => m.id === oldMember)) memberSelect.value = oldMember;
    renderHandoffHistory();
  }

  function renderHandoffHistory() {
    const root = $("handoffHistory");
    if (!data.handoffs.length) {
      root.innerHTML = '<div class="empty-state">Здесь появятся задания и сохранённые ответы ИИ.</div>';
      return;
    }
    root.innerHTML = data.handoffs.slice().reverse().map(h => `
      <article class="task-card"><div class="task-main"><b>${escapeHTML(h.title)}</b><small>${escapeHTML(h.projectTitle)} · ${escapeHTML(h.memberName)} · ${formatDate(h.createdAt)}</small><small>${h.result ? "Ответ сохранён" : "Ожидает ответа"}</small></div><div class="handoff-history-actions"><span class="task-state">${h.status === "done" ? "ВЫПОЛНЕНО" : "ОЖИДАЕТ"}</span><button class="small-btn" data-open-handoff="${escapeHTML(h.id)}">Открыть</button></div></article>`).join("");
  }

  function addMember() {
    const name = $("memberName").value.trim();
    const role = $("memberRole").value.trim();
    const urlText = $("memberUrl").value.trim();
    if (!name || !role) return notify("Укажи название ИИ и его роль");
    const url = urlText ? safeHttpUrl(urlText) : "";
    if (urlText && !url) return notify("Ссылка должна начинаться с https:// или http://");
    if (data.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return notify("Такой исполнитель уже есть");
    data.members.push({ id: makeId(), name, role, url });
    $("memberName").value = $("memberRole").value = $("memberUrl").value = "";
    persist();
    renderTeam();
    notify("Исполнитель добавлен");
  }

  function makeAssignment() {
    const project = data.projects.find(p => p.id === $("assignProject").value);
    const member = data.members.find(m => m.id === $("assignMember").value);
    const title = $("assignTitle").value.trim();
    const details = $("assignDetails").value.trim();
    if (!project) return notify("Сначала создай и выбери проект");
    if (!member) return notify("Добавь исполнителя");
    if (!title || !details) return notify("Заполни название и описание задания");
    const prompt = [
      `Ты — ${member.name}. Твоя роль: ${member.role}.`,
      "Выполни только поставленную задачу. Если данных не хватает, явно перечисли допущения. Не выдумывай факты и источники.",
      `\nПРОЕКТ: ${project.title}`,
      `ИДЕЯ ПРОЕКТА: ${project.idea}`,
      data.styleBible.name || data.styleBible.rules || data.styleBible.characters ? `\nSTYLE BIBLE:\nНазвание: ${data.styleBible.name}\nПравила: ${data.styleBible.rules}\nПерсонажи: ${data.styleBible.characters}` : "",
      `\nЗАДАНИЕ: ${title}`,
      `ТРЕБОВАНИЯ:\n${details}`,
      "\nФОРМАТ ОТВЕТА: сначала готовый результат, затем кратко — важные замечания, сомнения и что нужно уточнить. Не переходи к следующим этапам без отдельного задания."
    ].filter(Boolean).join("\n");
    const handoff = { id: makeId(), projectId: project.id, projectTitle: project.title, memberId: member.id, memberName: member.name, title, details, prompt, result: "", status: "waiting", createdAt: new Date().toISOString() };
    data.handoffs.push(handoff);
    activeHandoffId = handoff.id;
    $("handoffPrompt").value = prompt;
    $("workerResult").value = "";
    $("handoffPanel").hidden = false;
    $("assignTitle").value = $("assignDetails").value = "";
    persist();
    renderTeam();
    $("handoffPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    notify("Задание сформировано. Скопируй его в выбранный ИИ.");
  }

  async function copyPrompt() {
    const text = $("handoffPrompt").value;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        $("handoffPrompt").focus(); $("handoffPrompt").select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
      }
      notify("Задание скопировано");
    } catch (_) { $("handoffPrompt").focus(); $("handoffPrompt").select(); notify("Выделил текст — нажми «Копировать» в меню телефона"); }
  }

  function openWorker() {
    const h = data.handoffs.find(x => x.id === activeHandoffId);
    const m = h && data.members.find(x => x.id === h.memberId);
    if (!m || !m.url) return notify("Для этого ИИ не добавлена ссылка на сайт");
    window.open(m.url, "_blank", "noopener,noreferrer");
  }

  function saveWorkerResult() {
    const h = data.handoffs.find(x => x.id === activeHandoffId);
    if (!h) return notify("Сначала сформируй или открой задание");
    const result = $("workerResult").value.trim();
    if (!result) return notify("Вставь ответ ИИ перед сохранением");
    h.result = result;
    h.status = "done";
    persist();
    renderTeam();
    notify("Ответ сохранён в истории заданий");
  }

  function openHandoff(id) {
    const h = data.handoffs.find(x => x.id === id);
    if (!h) return;
    activeHandoffId = id;
    $("handoffPrompt").value = h.prompt;
    $("workerResult").value = h.result || "";
    $("handoffPanel").hidden = false;
    $("assignProject").value = h.projectId;
    $("assignMember").value = h.memberId;
    $("handoffPanel").scrollIntoView({ behavior: "smooth", block: "start" });
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
    $("addMember").addEventListener("click", addMember);
    $("makeAssignment").addEventListener("click", makeAssignment);
    $("copyPrompt").addEventListener("click", copyPrompt);
    $("openWorker").addEventListener("click", openWorker);
    $("saveResult").addEventListener("click", saveWorkerResult);
    document.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-member]");
      if (remove) {
        const id = remove.dataset.removeMember;
        if (!confirm("Убрать этого исполнителя из команды? История заданий сохранится.")) return;
        data.members = data.members.filter(m => m.id !== id);
        persist(); renderTeam(); notify("Исполнитель удалён"); return;
      }
      const openH = event.target.closest("[data-open-handoff]");
      if (openH) openHandoff(openH.dataset.openHandoff);
    });
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
    $("workflowList").innerHTML = workflow.map((s, i) => `
      <article class="timeline-item"><div class="step-number">${i + 1}</div><div><b>${escapeHTML(s[0])}</b><p>${escapeHTML(s[1])}</p></div></article>`).join("");
    $("styleName").value = data.styleBible.name || "";
    $("styleRules").value = data.styleBible.rules || "";
    $("characterRules").value = data.styleBible.characters || "";
  }

  function init() {
    bindEvents();
    installGemmaPanel();
    renderStaticSections();
    renderAll();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("PWA cache not registered:", error));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();