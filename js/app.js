/**
 * app.js —— 页面层：DOM 渲染与事件编排。
 * 工序/缺陷规则全部调用 WorkshopRules，数据读写走 WorkshopStorage。
 */
(function () {
  "use strict";

  const { STATUSES } = WorkshopRules;
  const R = WorkshopRules;
  const Store = WorkshopStorage;

  let works = Store.load();
  let activeId = null;

  const form = document.querySelector("#workForm");
  const board = document.querySelector("#board");
  const statusFilter = document.querySelector("#statusFilter");
  const themeFilter = document.querySelector("#themeFilter");
  const sortMode = document.querySelector("#sortMode");
  const dialog = document.querySelector("#detailDialog");
  const today = R.todayStr();

  form.dryDate.value = today;
  form.delivery.value = R.todayStr(new Date(Date.now() + 5 * 86400000));
  statusFilter.innerHTML =
    `<option value="">全部状态</option>` + STATUSES.map(s => `<option>${s}</option>`).join("");

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function persist() {
    Store.save(works);
  }

  function getWork(id) {
    return works.find(w => w.id === id);
  }

  /** 所有变更动作统一入口：出错弹提示，成功落库并重绘。 */
  function mutate(action, refreshDetail) {
    try {
      action();
      persist();
      render();
      if (refreshDetail && activeId && dialog.open) showDetail(activeId);
    } catch (e) {
      alert(e.message);
    }
  }

  function filtered() {
    return works
      .filter(w => !statusFilter.value || w.status === statusFilter.value)
      .filter(w => !themeFilter.value || w.theme.includes(themeFilter.value.trim()))
      .slice()
      .sort((a, b) => (a[sortMode.value] || "").localeCompare(b[sortMode.value] || ""));
  }

  function askReason(actionName) {
    const reason = prompt("请填写" + actionName + "原因（将记入流转记录）");
    if (reason === null) return null;
    return reason.trim();
  }

  function askDefect() {
    const text = prompt("记录断线/翘线等缺陷（保存后为「待修复」，修复后仍保留历史）");
    return text === null ? null : text.trim();
  }

  /* ---------------- 事件：看板卡片（事件委托，不再依赖内联 onclick） ---------------- */

  board.addEventListener("click", event => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    event.stopPropagation();
    const id = btn.closest("[data-id]").dataset.id;
    const work = getWork(id);
    if (!work) return;
    const action = btn.dataset.action;

    if (action === "advance") {
      mutate(() => R.advance(work, today));
    } else if (action === "rework") {
      const reason = askReason("返工");
      if (reason === null) return;
      mutate(() => R.rework(work, reason));
    } else if (action === "defect") {
      const text = askDefect();
      if (text === null) return;
      mutate(() => R.addDefect(work, text));
    } else if (action === "resolve") {
      const note = prompt("修复说明（可留空）：");
      if (note === null) return;
      mutate(() => R.resolveDefect(work, btn.dataset.defectId, note));
    }
  });

  board.addEventListener("click", event => {
    if (event.target.closest("button[data-action]")) return;
    const card = event.target.closest("[data-id]");
    if (card) showDetail(card.dataset.id);
  });

  /* ---------------- 事件：详情对话框 ---------------- */

  dialog.addEventListener("click", event => {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const work = activeId ? getWork(activeId) : null;
    if (!work) return;
    const action = btn.dataset.action;

    if (action === "advance") {
      mutate(() => R.advance(work, today), true);
    } else if (action === "rework") {
      const reason = askReason("返工");
      if (reason === null) return;
      mutate(() => R.rework(work, reason), true);
    } else if (action === "addDefect") {
      const input = document.querySelector("#defectInput");
      const text = input.value.trim();
      if (!text) return;
      mutate(() => R.addDefect(work, text), true);
    } else if (action === "resolve") {
      const note = prompt("修复说明（可留空）：");
      if (note === null) return;
      mutate(() => R.resolveDefect(work, btn.dataset.defectId, note), true);
    } else if (action === "close") {
      dialog.close();
    }
  });

  dialog.addEventListener("close", () => { activeId = null; });

  function showDetail(id) {
    activeId = id;
    const w = getWork(id);
    if (!w) return;
    document.querySelector("#detailTitle").textContent = `${w.theme} · ${w.base}`;

    const check = R.advanceBlockers(w, today);
    const blockerHtml = check.to
      ? (check.reasons.length
        ? `<div class="block">⛔ 不能推进到「${check.to}」：${check.reasons.map(esc).join("；")}</div>`
        : `<div class="ok">✅ 可推进到「${check.to}」</div>`)
      : `<div class="ok">已到最后一道工序</div>`;

    const defects = (w.defects || []).map(d => `
      <li class="${d.status === R.DEFECT_OPEN ? "def-open" : "def-fixed"}">
        <b>${esc(d.text)}</b>
        <div class="meta">${d.status} · ${esc(d.createdAt || "")}${d.source ? " · " + esc(d.source) : ""}${d.resolvedAt ? " · 修复于 " + esc(d.resolvedAt) : ""}${d.resolveNote ? " · " + esc(d.resolveNote) : ""}</div>
        ${d.status === R.DEFECT_OPEN ? `<button data-action="resolve" data-defect-id="${d.id}" class="warn tiny">标记已修复</button>` : ""}
      </li>`).join("");

    document.querySelector("#detailContent").innerHTML = `
      <p>胎体材质：${esc(w.base)} ｜ 线条粗细：${esc(w.line)} ｜ 贴线进度：${w.progress}%<br>
      阴干日期：${esc(w.dryDate)} ｜ 金粉状态：${esc(w.gold)} ｜ 交付日期：${esc(w.delivery)}<br>
      当前状态：<b>${esc(w.status)}</b> ｜ 备注：${esc(w.note) || "无"}</p>
      ${blockerHtml}
      <h4>缺陷记录（${R.openDefects(w).length} 条待修复）</h4>
      <ul class="defect-list">${defects || '<li class="empty">暂无缺陷记录</li>'}</ul>
      <h4>流转记录</h4>
      <div class="logs">${w.logs.map(esc).join("<br>")}</div>
    `;
    document.querySelector("#defectInput").value = "";

    const canRework = STATUSES.indexOf(w.status) > 0;
    document.querySelector("#detailAdvance").disabled = !check.to || check.reasons.length > 0;
    document.querySelector("#detailRework").disabled = !canRework;
    dialog.showModal();
  }

  /* ---------------- 渲染 ---------------- */

  function renderSummaries() {
    const todayDry = works.filter(w => w.status === "待阴干" && w.dryDate && w.dryDate <= today);
    const defects = works.filter(w => R.openDefects(w).length > 0);
    const delivery = works.slice().sort((a, b) => (a.delivery || "").localeCompare(b.delivery || "")).slice(0, 4);

    document.querySelector("#todayDry").innerHTML = todayDry.length
      ? todayDry.map(w => `<div class="item" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(w.base)} · 阴干 ${esc(w.dryDate)}</div></div>`).join("")
      : `<div class="empty">暂无</div>`;
    document.querySelector("#defectList").innerHTML = defects.length
      ? defects.map(w => `<div class="item overdue" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(R.openDefects(w).map(d => d.text).join("；"))}</div></div>`).join("")
      : `<div class="empty">暂无</div>`;
    document.querySelector("#deliveryList").innerHTML = delivery.length
      ? delivery.map(w => `<div class="item" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(w.delivery)} · ${esc(w.status)}</div></div>`).join("")
      : `<div class="empty">暂无</div>`;
  }

  function cardActions(w) {
    const idx = STATUSES.indexOf(w.status);
    const check = R.advanceBlockers(w, today);
    const canAdvance = check.to && check.reasons.length === 0;
    const nextLabel = check.to ? `推进 → ${check.to}` : "已是末道";

    const defectBtns = R.openDefects(w).map(d =>
      `<button class="warn tiny" data-action="resolve" data-defect-id="${d.id}" title="${esc(d.text)}">修复</button>`
    ).join("");

    return `
      <button data-action="advance" ${canAdvance ? "" : "disabled"} title="${check.reasons.length ? esc(check.reasons.join("；")) : ""}">${nextLabel}</button>
      <button data-action="rework" ${idx > 0 ? "" : "disabled"}>返工退回</button>
      <button data-action="defect" class="warn">记缺陷</button>
      ${defectBtns}
    `;
  }

  function renderBoard() {
    const list = filtered();
    board.innerHTML = STATUSES.map(status => {
      const cards = list.filter(w => w.status === status);
      return `<section class="col">
        <h3><span>${status}</span><span>${cards.length}</span></h3>
        ${cards.length ? cards.map(w => {
          const open = R.openDefects(w);
          const blocker = R.advanceBlockers(w, today);
          const hint = w.status === "待阴干" && blocker.reasons.length
            ? `<div class="block tiny-text">${esc(blocker.reasons.join("；"))}</div>` : "";
          return `<article class="item ${open.length ? "overdue" : ""}" data-id="${w.id}">
            <b>${esc(w.theme)}</b>
            <div class="meta">${esc(w.base)} · ${esc(w.line)}<br>进度 ${w.progress}% · 阴干 ${esc(w.dryDate)}<br>金粉：${esc(w.gold)} · 交付：${esc(w.delivery)}<br>
            缺陷：${open.length ? esc(open.map(d => d.text).join("；")) : "无待修复"}${w.defects && w.defects.some(d => d.status === R.DEFECT_FIXED) ? "（含已修复）" : ""}</div>
            ${hint}
            <div class="actions">${cardActions(w)}</div>
          </article>`;
        }).join("") : `<div class="empty">暂无作品</div>`}
      </section>`;
    }).join("");
  }

  function render() {
    renderSummaries();
    renderBoard();
  }

  /* ---------------- 新增作品 ---------------- */

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const work = R.createWork(data);
    works.unshift(work);
    persist();
    form.reset();
    form.dryDate.value = today;
    form.delivery.value = R.todayStr(new Date(Date.now() + 5 * 86400000));
    render();
  });

  /* ---------------- 筛选与导出 ---------------- */

  document.querySelector("#clearFilters").addEventListener("click", () => {
    themeFilter.value = "";
    statusFilter.value = "";
    render();
  });
  [statusFilter, themeFilter, sortMode].forEach(el => el.addEventListener("input", render));

  // 摘要列表点击委托
  document.querySelectorAll(".mini").forEach(mini => {
    mini.addEventListener("click", event => {
      const item = event.target.closest("[data-id]");
      if (item) showDetail(item.dataset.id);
    });
  });

  document.querySelector("#exportBtn").addEventListener("click", () => Store.exportJSON(works));

  render();
})();
