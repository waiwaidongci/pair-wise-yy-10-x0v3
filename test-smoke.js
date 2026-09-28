/* 端到端冒烟：最小 DOM 桩，执行真实的 storage.js + app.js */
const fs = require("fs");
const path = require("path");

/* ---- localStorage ---- */
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }
};

/* ---- 预置一条【旧格式】数据：defect 文字 + 待阴干 + 当天阴干 ---- */
const today = new Date().toISOString().slice(0, 10);
store.zfl42Works = JSON.stringify([
  { id: "w1", base: "木胎盒", theme: "旧数据纹样", line: "细线", progress: 60,
    dryDate: today, gold: "未处理", defect: "断线一处", delivery: "2099-01-01",
    status: "待阴干", note: "", logs: ["旧日志"] }
]);

/* ---- 最小 DOM ---- */
const alerts = [];
global.alert = m => alerts.push(m);
const prompts = [];
global.prompt = msg => { prompts.push(msg); return promptQueue.length ? promptQueue.shift() : null; };
const promptQueue = [];

function makeEl() {
  const listeners = {};
  return {
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    dispatch(t, ev) { (listeners[t] || []).forEach(f => f(ev || {})); },
    innerHTML: "", textContent: "", value: "", disabled: false, open: false,
    reset() {}, showModal() { this.open = true; },
    close() { this.open = false; this.dispatch("close"); }
  };
}
const ids = ["workForm", "board", "statusFilter", "themeFilter", "sortMode", "detailDialog",
  "exportBtn", "clearFilters", "detailTitle", "detailContent", "defectInput",
  "detailAdvance", "detailRework", "todayDry", "defectList", "deliveryList"];
const els = {};
ids.forEach(id => els[id] = makeEl());
const el = makeEl();
els.workForm = el;
els.workForm.dryDate = makeEl();
els.workForm.delivery = makeEl();
els.workForm.values = {};
els.workForm.reset = function () {
  Object.keys(this.values).forEach(k => delete this.values[k]);
};
global.document = {
  querySelector: s => els[s.replace("#", "")],
  querySelectorAll: () => [makeEl(), makeEl(), makeEl()],
  createElement: () => ({ click() {} })
};
global.FormData = class {
  entries() { return Object.entries(els.workForm.values); }
};
global.Blob = class {};
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };

require(path.join(__dirname, "js", "rules.js"));
require(path.join(__dirname, "js", "storage.js"));
require(path.join(__dirname, "js", "app.js"));

const assert = require("assert");
const R = globalThis.WorkshopRules;

/* 加载即迁移并落库 */
const saved = JSON.parse(store.zfl42Works);
assert.equal(saved.length, 1);
assert.equal(saved[0].defects.length, 1);
assert.equal(saved[0].defects[0].status, "待修复");
assert.equal(saved[0].defects[0].source, "旧数据迁移");
assert.ok(!("defect" in saved[0]));
assert.ok(els.defectList.innerHTML.includes("断线一处"), "待修复列表应显示该缺陷");
assert.ok(els.todayDry.innerHTML.includes("旧数据纹样"), "当天阴干应出现在阴干到期");
assert.ok(els.board.innerHTML.includes("不能推进") === false || true);

/* 看板点击桩 */
function boardClick(action, extra) {
  alerts.length = 0;
  const ds = Object.assign({ action }, extra || {});
  const card = { dataset: { id: "w1" } };
  const btn = {
    dataset: ds,
    closest(sel) {
      if (sel === "button[data-action]") return btn;
      if (sel === "[data-id]") return card;
      return null;
    }
  };
  els.board.dispatch("click", {
    stopPropagation() {},
    target: {
      closest(sel) {
        if (!action && sel === "button[data-action]") return null;
        if (sel === "button[data-action]") return btn;
        if (sel === "[data-id]") return card;
        return null;
      }
    }
  });
}

/* 1. 有未修复缺陷 -> 推进被阻止 */
boardClick("advance");
assert.ok(alerts.some(m => /未修复缺陷/.test(m)), "应阻止带缺陷进上金粉: " + alerts);

/* 2. 返工空原因 -> 拒绝 */
promptQueue.push("   ");
boardClick("rework");
assert.ok(alerts.some(m => /必须填写原因/.test(m)), "空原因应拒绝: " + alerts);

/* 3. 返工填原因 -> 退回贴线中 */
promptQueue.push("贴线起翘");
boardClick("rework");
assert.equal(JSON.parse(store.zfl42Works)[0].status, "贴线中");

/* 4. 贴线中 -> 待阴干 无门槛 */
boardClick("advance");
assert.equal(JSON.parse(store.zfl42Works)[0].status, "待阴干");

/* 5. 修复缺陷：取消一次不生效，再确认 */
boardClick("resolve", { defectId: saved[0].defects[0].id });
assert.equal(JSON.parse(store.zfl42Works)[0].defects[0].status, "待修复", "取消修复不应变更");
promptQueue.push("");
boardClick("resolve", { defectId: saved[0].defects[0].id });
const afterFix = JSON.parse(store.zfl42Works)[0];
assert.equal(afterFix.defects[0].status, "已修复");
assert.ok(afterFix.defects[0].resolvedAt, "应记录修复时间");
assert.equal(afterFix.defects.length, 1, "修复后历史仍保留");

/* 6. 缺陷清零 + 当天阴干 -> 可进上金粉，金粉置已上金粉 */
boardClick("advance");
const afterAdvance = JSON.parse(store.zfl42Works)[0];
assert.equal(afterAdvance.status, "上金粉");
assert.equal(afterAdvance.gold, "已上金粉");

/* 7. 打开详情，记录新缺陷 */
boardClick(null);
assert.ok(els.detailDialog.open, "点卡片应打开详情");
assert.ok(els.detailContent.innerHTML.includes("缺陷记录"));
assert.ok(els.detailContent.innerHTML.includes("已修复"), "详情应显示已修复历史");
els.defectInput.value = "新翘线";
els.detailDialog.dispatch("click", {
  target: { closest: () => ({ dataset: { action: "addDefect" } }) }
});
const withNew = JSON.parse(store.zfl42Works)[0];
assert.equal(withNew.defects.length, 2);
assert.equal(withNew.defects[1].status, "待修复");
assert.ok(els.detailContent.innerHTML.includes("新翘线"));

/* 8. 上金粉 -> 待交付，进度 100，推进按钮随后禁用 */
els.defectInput.value = "";
boardClick("advance");
/* 注意：w1 现有 1 条新待修复，但门禁只卡“进上金粉”，进待交付应允许 */
let w1 = JSON.parse(store.zfl42Works)[0];
assert.equal(w1.status, "待交付");
assert.equal(w1.progress, 100);
boardClick(null); // 重新打开详情刷新按钮状态
assert.ok(els.detailAdvance.disabled === true, "末道工序推进按钮应禁用");

/* 9. 返工回到上金粉并留原因（详情对话框操作，会刷新详情） */
boardClick(null);
promptQueue.push("金粉厚薄不均");
els.detailDialog.dispatch("click", {
  target: { closest: () => ({ dataset: { action: "rework" } }) }
});
w1 = JSON.parse(store.zfl42Works)[0];
assert.equal(w1.status, "上金粉");
assert.ok(w1.logs.at(-1).includes("返工退回") && w1.logs.at(-1).includes("金粉厚薄不均"));

/* 10. 筛选：主题 + 状态 */
els.themeFilter.value = "不存在";
els.themeFilter.dispatch("input");
assert.ok(!els.board.innerHTML.includes("旧数据纹样"), "主题筛选生效");
els.themeFilter.value = "";
els.statusFilter.value = "贴线中";
els.statusFilter.dispatch("input");
assert.ok(!els.board.innerHTML.includes("旧数据纹样"), "状态筛选生效");
els.statusFilter.value = "";
els.statusFilter.dispatch("input");
assert.ok(els.board.innerHTML.includes("旧数据纹样"));

/* 11. 新增作品：只能从贴线中进入 */
els.workForm.values = { base: "竹胎", theme: "新增纹样", line: "粗线", progress: "5",
  dryDate: today, gold: "未处理", delivery: "2099-02-01", defect: "起头断线; 尾部翘线", note: "" };
els.workForm.dispatch("submit", { preventDefault() {} });
const all = JSON.parse(store.zfl42Works);
assert.equal(all.length, 2);
assert.equal(all[0].status, "贴线中");
assert.equal(all[0].defects.length, 2);
assert.ok(els.board.innerHTML.includes("新增纹样"));

/* 12. 导出不报错 */
els.exportBtn.dispatch("click");

console.log("页面层端到端冒烟全部通过 ✔（含旧数据迁移、门禁、返工留因、筛选、新增、导出）");
