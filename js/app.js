/*
 * 页面层：表单、看板、详情弹窗、筛选、导出。
 * 流转判定与数据变更全部走 Workflow，持久化走 Store。
 */
(function () {
  "use strict";

  const statuses = Workflow.STATUSES;
  const today = Workflow.todayStr();

  let works = Store.load();
  let activeId = null;

  const form = document.querySelector("#workForm");
  const board = document.querySelector("#board");
  const statusFilter = document.querySelector("#statusFilter");
  const themeFilter = document.querySelector("#themeFilter");
  const sortMode = document.querySelector("#sortMode");
  const dialog = document.querySelector("#detailDialog");
  const detailTitle = document.querySelector("#detailTitle");
  const detailContent = document.querySelector("#detailContent");

  form.dryDate.value = today;
  form.delivery.value = Workflow.todayStr(new Date(Date.now() + 5 * 86400000));
  statusFilter.innerHTML =
    `<option value="">全部状态</option>` + statuses.map(s => `<option>${s}</option>`).join("");

  function persist() {
    Store.save(works);
  }

  function getWork(id) {
    return works.find(w => w.id === id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function defectSummary(w) {
    const open = Workflow.openDefects(w).length;
    const fixed = w.defects.length - open;
    if (!w.defects.length) return "缺陷：无";
    const parts = [`${open} 处待修复`];
    if (fixed) parts.push(`${fixed} 处已修复`);
    return "缺陷：" + parts.join("，");
  }

  // ---------- 页面操作：内部调用规则层，失败时把原因提示给用户 ----------

  function handleAdvance(id) {
    const work = getWork(id);
    const result = Workflow.advance(work, today);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    persist();
    if (dialog.open && activeId === id) showDetail(id);
    render();
  }

  function handleRework(id) {
    const work = getWork(id);
    const target = Workflow.prevStatus(work.status);
    if (!target) {
      alert("贴线中是第一道工序，无法再返工。");
      return;
    }
    const reason = prompt(`返工退回「${target}」，请填写原因：`);
    if (reason === null) return;
    const result = Workflow.rework(work, reason);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    persist();
    if (dialog.open && activeId === id) showDetail(id);
    render();
  }

  function handleAddDefect(id, text, afterSave) {
    const work = getWork(id);
    const result = Workflow.addDefect(work, text);
    if (!result.ok) {
      alert(result.error);
      return false;
    }
    persist();
    render();
    if (afterSave) afterSave();
    return true;
  }

  function handleRepairDefect(id, defectId) {
    const work = getWork(id);
    const note = prompt("修复说明（可留空，仅用于历史记录）：", "");
    if (note === null) return;
    const result = Workflow.repairDefect(work, defectId, note);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    persist();
    render();
    showDetail(id);
  }

  // ---------- 详情弹窗 ----------

  function showDetail(id) {
    activeId = id;
    const w = getWork(id);
    if (!w) return;
    detailTitle.textContent = `${w.theme} · ${w.base}`;

    const gate = Workflow.checkAdvance(w, today);
    const next = Workflow.nextStatus(w.status);
    let gateLine = "已到最后一道工序：待交付。";
    if (next) {
      gateLine = gate.ok
        ? `下一步可推进至「${next}」。`
        : `下一步「${next}」被阻止：${esc(gate.error)}`;
    }

    const defectRows = w.defects.length
      ? w.defects.map(d => `
          <div class="defect ${d.status === "已修复" ? "fixed" : "open"}">
            <div><b>${esc(d.status)}</b>：${esc(d.text)}${d.migrated ? "（旧数据迁移）" : ""}</div>
            <div class="meta">
              ${d.createdAt ? "记录于 " + esc(d.createdAt) : ""}
              ${d.fixedAt ? " · 修复于 " + esc(d.fixedAt) : ""}
              ${d.fixNote ? " · 说明：" + esc(d.fixNote) : ""}
            </div>
            ${d.status !== "已修复" ? `<button class="warn" data-action="repair" data-defect="${d.id}">标记修复</button>` : ""}
          </div>`).join("")
      : `<div class="empty">暂无缺陷记录</div>`;

    detailContent.innerHTML = `
      <div class="meta">
        胎体材质：${esc(w.base)}<br>线条粗细：${esc(w.line)}<br>贴线进度：${w.progress}%<br>
        阴干日期：${esc(w.dryDate)}<br>金粉状态：${esc(w.gold)}<br>
        交付日期：${esc(w.delivery)}<br>当前状态：${esc(w.status)}<br>备注：${esc(w.note) || "无"}
      </div>
      <div class="gate ${gate.ok ? "ok" : "blocked"}">${gateLine}</div>
      <div>
        <h3 class="subhead">缺陷记录（修复后历史保留）</h3>
        ${defectRows}
      </div>
      <label>记录缺陷<input id="defectInput" placeholder="断线/翘线位置"></label>
      <div class="actions">
        ${next ? `<button data-action="advance" ${gate.ok ? "" : "disabled"} class="${gate.ok ? "" : "secondary"}">推进至 ${next}</button>` : ""}
        ${Workflow.prevStatus(w.status) ? `<button data-action="rework" class="violet">返工至 ${Workflow.prevStatus(w.status)}</button>` : ""}
        <button data-action="saveDefect" class="warn">保存缺陷</button>
        <button data-action="close" class="secondary">关闭</button>
      </div>
      <details>
        <summary class="meta">流转记录（${w.logs.length}）</summary>
        <ul class="logs">${w.logs.map(log => `<li>${esc(log)}</li>`).join("")}</ul>
      </details>
    `;

    if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener("click", event => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl || !activeId) return;
    const action = actionEl.dataset.action;
    if (action === "close") dialog.close();
    if (action === "advance") handleAdvance(activeId);
    if (action === "rework") handleRework(activeId);
    if (action === "repair") handleRepairDefect(activeId, actionEl.dataset.defect);
    if (action === "saveDefect") {
      const input = document.querySelector("#defectInput");
      if (input && handleAddDefect(activeId, input.value.trim(), () => {})) {
        showDetail(activeId); // 重渲染，缺陷记录与门禁即时刷新，弹窗保持打开
      }
    }
  });

  // ---------- 看板与摘要 ----------

  function filtered() {
    return works
      .filter(w => !statusFilter.value || w.status === statusFilter.value)
      .filter(w => !themeFilter.value || w.theme.includes(themeFilter.value.trim()))
      .sort((a, b) => (a[sortMode.value] || "").localeCompare(b[sortMode.value] || ""));
  }

  function cardActions(w) {
    const gate = Workflow.checkAdvance(w, today);
    const next = Workflow.nextStatus(w.status);
    const prev = Workflow.prevStatus(w.status);
    const buttons = [];
    if (next) {
      buttons.push(
        gate.ok
          ? `<button data-action="advance">推进：${next}</button>`
          : `<button disabled class="secondary" title="${esc(gate.error)}">不能进 ${next}</button>`
      );
    } else {
      buttons.push(`<button disabled class="secondary">末道工序</button>`);
    }
    if (prev) buttons.push(`<button data-action="rework" class="violet">返工</button>`);
    buttons.push(`<button data-action="defect" class="warn">记缺陷</button>`);
    return buttons.join("");
  }

  function renderBoard() {
    const list = filtered();
    board.innerHTML = statuses.map(status => {
      const cards = list.filter(w => w.status === status);
      return `<section class="col">
        <h3><span>${status}</span><span>${cards.length}</span></h3>
        ${cards.length ? cards.map(w => {
          const open = Workflow.openDefects(w).length;
          return `<article class="item ${open ? "overdue" : ""}" data-id="${w.id}">
            <b>${esc(w.theme)}</b>
            <div class="meta">${esc(w.base)} · ${esc(w.line)}<br>进度 ${w.progress}% · 阴干 ${esc(w.dryDate)}<br>金粉：${esc(w.gold)} · 交付：${esc(w.delivery)}<br>${esc(defectSummary(w))}</div>
            <div class="actions">${cardActions(w)}</div>
          </article>`;
        }).join("") : `<div class="empty">暂无作品</div>`}
      </section>`;
    }).join("");
  }

  board.addEventListener("click", event => {
    const card = event.target.closest(".item");
    if (!card) return;
    const id = card.dataset.id;
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === "advance") handleAdvance(id);
      if (action === "rework") handleRework(id);
      if (action === "defect") {
        const text = prompt("输入断线/翘线位置：", "");
        if (text !== null) handleAddDefect(id, text, () => {});
      }
      return;
    }
    showDetail(id);
  });

  function renderSummaries() {
    const todayDry = works.filter(w => w.status === "待阴干" && w.dryDate <= today);
    const defectWorks = works.filter(w => Workflow.openDefects(w).length);
    const delivery = [...works].sort((a, b) => a.delivery.localeCompare(b.delivery)).slice(0, 4);

    document.querySelector("#todayDry").innerHTML = todayDry.length
      ? todayDry.map(w => `<div class="item" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(w.base)} · 阴干到期 ${esc(w.dryDate)}</div></div>`).join("")
      : `<div class="empty">暂无</div>`;
    document.querySelector("#defectList").innerHTML = defectWorks.length
      ? defectWorks.map(w => `<div class="item overdue" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(Workflow.openDefects(w).map(d => d.text).join("；"))}</div></div>`).join("")
      : `<div class="empty">暂无</div>`;
    document.querySelector("#deliveryList").innerHTML = delivery
      .map(w => `<div class="item" data-id="${w.id}"><b>${esc(w.theme)}</b><div class="meta">${esc(w.delivery)} · ${esc(w.status)}</div></div>`)
      .join("");

    document.querySelectorAll(".mini .item").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => showDetail(el.dataset.id));
    });
  }

  function render() {
    renderSummaries();
    renderBoard();
  }

  // ---------- 新增 ----------

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const work = {
      id: crypto.randomUUID(),
      base: data.base,
      theme: data.theme,
      line: data.line,
      progress: Number(data.progress),
      dryDate: data.dryDate,
      gold: "未处理",
      delivery: data.delivery,
      status: "贴线中",
      note: data.note,
      defects: [],
      logs: [`${new Date().toLocaleString()} 创建作品（初始工序：贴线中）`]
    };
    works.unshift(work);
    if ((data.defect || "").trim()) {
      Workflow.addDefect(work, data.defect);
    }
    persist();
    form.reset();
    form.dryDate.value = today;
    form.delivery.value = Workflow.todayStr(new Date(Date.now() + 5 * 86400000));
    render();
  });

  // ---------- 筛选与导出 ----------

  document.querySelector("#clearFilters").addEventListener("click", () => {
    themeFilter.value = "";
    statusFilter.value = "";
    render();
  });
  [statusFilter, themeFilter, sortMode].forEach(el => el.addEventListener("input", render));

  document.querySelector("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(works, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lacquer-thread-works.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  persist();
  render();
})();
