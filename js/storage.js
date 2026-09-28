/**
 * storage.js —— 存储层：localStorage 持久化、种子数据、旧数据结构迁移。
 * 页面层只通过这里读写作品，不直接碰 localStorage。
 */
(function (root) {
  "use strict";

  const R = root.WorkshopRules;
  const STORAGE_KEY = "zfl42Works";

  function seedWorks() {
    const today = R.todayStr();
    const inDays = n => R.todayStr(new Date(Date.now() + n * 86400000));
    // 演示数据刻意保留旧版 defect 文字字段，首次加载时由 migrateWork 迁移
    return [
      {
        id: R.uid(),
        base: "木胎香盒", theme: "海水江崖", line: "细线", progress: 70,
        dryDate: today, gold: "未处理", defect: "", delivery: inDays(5),
        status: "待阴干", note: "边线需保持低浮雕感", logs: [new Date().toLocaleString() + " 创建作品"]
      },
      {
        id: R.uid(),
        base: "脱胎盘", theme: "折枝梅", line: "混合线", progress: 95,
        dryDate: "2026-06-20", gold: "试扫粉", defect: "左侧枝干翘线",
        delivery: "2026-06-23", status: "上金粉",
        note: "客户要求金粉偏暗", logs: [new Date().toLocaleString() + " 创建作品"]
      },
      {
        id: R.uid(),
        base: "竹胎笔筒", theme: "云雷纹", line: "中线", progress: 40,
        dryDate: inDays(2), gold: "未处理", defect: "",
        delivery: inDays(7), status: "贴线中", note: "",
        logs: [new Date().toLocaleString() + " 创建作品"]
      }
    ];
  }

  /** 读取并迁移全部作品；无数据时写入种子。 */
  function load() {
    let raw = [];
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || null;
    } catch (e) {
      raw = null;
    }
    if (!raw || !Array.isArray(raw)) {
      raw = seedWorks();
    }
    const works = raw.map(R.migrateWork);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(works));
    return works;
  }

  function save(works) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(works));
  }

  function exportJSON(works) {
    const blob = new Blob([JSON.stringify(works, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lacquer-thread-works.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  root.WorkshopStorage = { STORAGE_KEY, load, save, exportJSON };
})(typeof globalThis !== "undefined" ? globalThis : this);
