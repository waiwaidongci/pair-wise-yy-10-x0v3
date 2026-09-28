/**
 * rules.js —— 漆线雕工坊的领域规则层（纯逻辑，不接触 localStorage 与 DOM）
 * 负责：工序流转约束、返工、缺陷记录、旧数据迁移、作品创建。
 */
(function (root) {
  "use strict";

  const STATUSES = ["贴线中", "待阴干", "上金粉", "待交付"];
  const DEFECT_OPEN = "待修复";
  const DEFECT_FIXED = "已修复";

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  function stamp() {
    return new Date().toLocaleString();
  }
  function todayStr(date) {
    return (date || new Date()).toISOString().slice(0, 10);
  }

  function nextStatus(status) {
    const i = STATUSES.indexOf(status);
    return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
  }
  function prevStatus(status) {
    const i = STATUSES.indexOf(status);
    return i > 0 ? STATUSES[i - 1] : null;
  }

  function defectsOf(work) {
    return Array.isArray(work.defects) ? work.defects : [];
  }
  function openDefects(work) {
    return defectsOf(work).filter(d => d.status === DEFECT_OPEN);
  }

  /** 旧数据用 "; " 拼接缺陷文字，这里兼容中英文分号与换行，拆成多条 */
  function splitDefectText(text) {
    return String(text || "")
      .split(/[;；\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  /**
   * 推进前的阻塞检查，不改动作品。
   * 返回 { to, reasons }，reasons 为空表示可以推进。
   */
  function advanceBlockers(work, today) {
    const day = today || todayStr();
    const to = nextStatus(work.status);
    if (!to) return { to: null, reasons: ["已是最后一道工序"] };

    const reasons = [];
    if (work.status === "待阴干") {
      if (!work.dryDate) {
        reasons.push("尚未设置阴干日期");
      } else if (work.dryDate > day) {
        reasons.push("阴干日期 " + work.dryDate + " 未到（今天 " + day + "），需继续等待阴干");
      }
      const openCount = openDefects(work).length;
      if (openCount > 0) {
        reasons.push("有 " + openCount + " 条未修复缺陷，不能进入上金粉");
      }
    }
    return { to, reasons };
  }

  function canAdvance(work, today) {
    return advanceBlockers(work, today).reasons.length === 0;
  }

  /** 顺序推进一道工序；不满足条件时抛错，由页面层提示。 */
  function advance(work, today) {
    const check = advanceBlockers(work, today);
    if (!check.to) throw new Error("已是最后一道工序");
    if (check.reasons.length > 0) throw new Error(check.reasons.join("；"));

    const from = work.status;
    work.status = check.to;
    if (check.to === "上金粉") work.gold = "已上金粉";
    if (check.to === "待交付") work.progress = 100;
    work.logs.push(stamp() + " 工序推进：" + from + " → " + check.to);
    return work;
  }

  /** 返工：只能退回上一道，且必须留下原因。 */
  function rework(work, reason) {
    const to = prevStatus(work.status);
    if (!to) throw new Error("「贴线中」是第一道工序，无法返工");
    const why = String(reason || "").trim();
    if (!why) throw new Error("返工必须填写原因");

    const from = work.status;
    work.status = to;
    work.logs.push(stamp() + " 返工退回：" + from + " → " + to + "，原因：" + why);
    return work;
  }

  function addDefect(work, text) {
    const value = String(text || "").trim();
    if (!value) throw new Error("缺陷内容不能为空");
    const record = { id: uid(), text: value, status: DEFECT_OPEN, createdAt: stamp() };
    if (!Array.isArray(work.defects)) work.defects = [];
    work.defects.push(record);
    work.logs.push(stamp() + " 记录缺陷：" + value);
    return record;
  }

  /** 修复缺陷：只改状态，记录与历史日志都保留。 */
  function resolveDefect(work, defectId, note) {
    const record = defectsOf(work).find(d => d.id === defectId);
    if (!record) throw new Error("未找到该缺陷记录");
    if (record.status === DEFECT_FIXED) throw new Error("该缺陷已修复");
    record.status = DEFECT_FIXED;
    record.resolvedAt = stamp();
    if (String(note || "").trim()) record.resolveNote = String(note).trim();
    work.logs.push(stamp() + " 缺陷已修复：" + record.text);
    return record;
  }

  /** 新作品一律从「贴线中」进入，不允许建单时跳工序。 */
  function createWork(data) {
    const now = stamp();
    const work = {
      id: uid(),
      base: String(data.base || "").trim(),
      theme: String(data.theme || "").trim(),
      line: data.line || "中线",
      progress: Number(data.progress) || 0,
      dryDate: data.dryDate || "",
      gold: data.gold || "未处理",
      delivery: data.delivery || "",
      status: STATUSES[0],
      note: String(data.note || "").trim(),
      defects: [],
      logs: [now + " 创建作品，进入「" + STATUSES[0] + "」"],
      createdAt: now
    };
    splitDefectText(data.defect).forEach(text => {
      work.defects.push({ id: uid(), text, status: DEFECT_OPEN, createdAt: now });
    });
    if (work.defects.length) {
      work.logs.push(now + " 记录缺陷：" + work.defects.map(d => d.text).join("；"));
    }
    return work;
  }

  /**
   * 旧数据迁移：把拼在 work.defect 里的文字拆成「待修复」缺陷记录。
   * 幂等：迁移后删除 defect 字段，重复执行不会产生重复记录或日志。
   */
  function migrateWork(input) {
    const work = Object.assign({}, input);
    if (!Array.isArray(work.defects)) work.defects = [];
    if (!Array.isArray(work.logs)) work.logs = [];

    if (typeof work.defect === "string" && work.defect.trim()) {
      const texts = splitDefectText(work.defect);
      const at = stamp();
      texts.forEach(text => {
        work.defects.push({ id: uid(), text, status: DEFECT_OPEN, createdAt: at, source: "旧数据迁移" });
      });
      work.logs.push(at + " 旧版缺陷文字迁移为待修复记录：" + texts.join("；"));
    }
    delete work.defect;

    if (!STATUSES.includes(work.status)) work.status = STATUSES[0];
    return work;
  }

  root.WorkshopRules = {
    STATUSES,
    DEFECT_OPEN,
    DEFECT_FIXED,
    uid,
    todayStr,
    nextStatus,
    prevStatus,
    openDefects,
    splitDefectText,
    advanceBlockers,
    canAdvance,
    advance,
    rework,
    addDefect,
    resolveDefect,
    createWork,
    migrateWork
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
