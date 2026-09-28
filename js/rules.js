/*
 * 规则层：工序流转、阴干/缺陷门禁、返工、缺陷记录与旧数据规整。
 * 不接触 DOM 和 localStorage，纯数据操作，便于单独测试与复用。
 */
(function () {
  "use strict";

  const STATUSES = ["贴线中", "待阴干", "上金粉", "待交付"];
  const NEXT = { "贴线中": "待阴干", "待阴干": "上金粉", "上金粉": "待交付" };
  const PREV = { "待阴干": "贴线中", "上金粉": "待阴干", "待交付": "上金粉" };

  function todayStr(date) {
    return (date || new Date()).toISOString().slice(0, 10);
  }

  function nowText() {
    return new Date().toLocaleString();
  }

  function nextStatus(status) {
    return NEXT[status] || null;
  }

  function prevStatus(status) {
    return PREV[status] || null;
  }

  function openDefects(work) {
    return (work.defects || []).filter(d => d.status !== "已修复");
  }

  // 只做“能否进入下一道”的判定，不修改数据。
  function checkAdvance(work, today) {
    const target = NEXT[work.status];
    if (!target) {
      return { ok: false, error: "已经是最后一道工序（待交付），无需推进。" };
    }
    if (target === "上金粉") {
      if (!work.dryDate) {
        return { ok: false, error: "未设置阴干日期，不能进入上金粉。" };
      }
      if (work.dryDate > today) {
        return { ok: false, error: `阴干日期 ${work.dryDate} 未到（今天 ${today}），只能停在待阴干。` };
      }
      const pending = openDefects(work);
      if (pending.length) {
        return {
          ok: false,
          error: `有 ${pending.length} 处未修复缺陷（${pending.map(d => d.text).join("；")}），修复后才能进入上金粉。`
        };
      }
    }
    return { ok: true, target };
  }

  // 顺序推进：贴线中 → 待阴干 → 上金粉 → 待交付。
  function advance(work, today) {
    const result = checkAdvance(work, today);
    if (!result.ok) return result;
    work.status = result.target;
    if (result.target === "上金粉") work.gold = "已上金粉";
    if (result.target === "待交付") work.progress = 100;
    work.logs.push(`${nowText()} 推进至 ${result.target}`);
    return { ok: true, target: result.target };
  }

  // 返工：只允许退回紧邻的上一道，且必须留下原因。
  function rework(work, reason) {
    reason = (reason || "").trim();
    if (!reason) {
      return { ok: false, error: "返工必须填写原因。" };
    }
    const target = PREV[work.status];
    if (!target) {
      return { ok: false, error: "贴线中是第一道工序，无法再返工。" };
    }
    work.status = target;
    work.logs.push(`${nowText()} 返工退回 ${target}，原因：${reason}`);
    return { ok: true, target, reason };
  }

  function addDefect(work, text) {
    text = (text || "").trim();
    if (!text) {
      return { ok: false, error: "请填写缺陷位置或描述。" };
    }
    const defect = {
      id: crypto.randomUUID(),
      text,
      status: "待修复",
      createdAt: nowText(),
      fixedAt: "",
      fixNote: "",
      migrated: false
    };
    work.defects.push(defect);
    work.logs.push(`${defect.createdAt} 记录缺陷（待修复）：${text}`);
    return { ok: true, defect };
  }

  // 修复后记录仍保留在 defects 中，作为历史可查。
  function repairDefect(work, defectId, note) {
    const defect = (work.defects || []).find(d => d.id === defectId);
    if (!defect) return { ok: false, error: "未找到缺陷记录。" };
    if (defect.status === "已修复") return { ok: false, error: "该缺陷已修复，历史记录已保留。" };
    defect.status = "已修复";
    defect.fixedAt = nowText();
    defect.fixNote = (note || "").trim();
    work.logs.push(
      `${defect.fixedAt} 缺陷修复完成：${defect.text}${defect.fixNote ? `（${defect.fixNote}）` : ""}`
    );
    return { ok: true, defect };
  }

  // 数据规整：把旧版 defect 文字迁成待修复记录；修复记录不会被删除。
  function normalize(work) {
    work.logs = Array.isArray(work.logs) ? work.logs : [];
    if (!Array.isArray(work.defects)) {
      work.defects = [];
      const legacyText = (work.defect || "").trim();
      if (legacyText) {
        work.defects.push({
          id: crypto.randomUUID(),
          text: legacyText,
          status: "待修复",
          createdAt: "",
          fixedAt: "",
          fixNote: "",
          migrated: true
        });
        work.logs.push(`${nowText()} 旧缺陷文字迁移为待修复记录：${legacyText}`);
      }
      delete work.defect;
    }
    if (!STATUSES.includes(work.status)) work.status = "贴线中";
    if (!work.gold) work.gold = "未处理";
    return work;
  }

  window.Workflow = {
    STATUSES,
    nextStatus,
    prevStatus,
    openDefects,
    checkAdvance,
    advance,
    rework,
    addDefect,
    repairDefect,
    normalize,
    todayStr
  };
})();
