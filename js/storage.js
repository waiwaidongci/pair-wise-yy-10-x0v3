/*
 * 存储层：localStorage 读写、首次种子数据、加载时旧数据迁移。
 * 不包含流转规则，也不关心页面如何渲染。
 */
(function () {
  "use strict";

  const STORAGE_KEY = "zfl42Works";

  function seed(today) {
    return [
      {
        id: crypto.randomUUID(),
        base: "木胎香盒",
        theme: "海水江崖",
        line: "细线",
        progress: 70,
        dryDate: today,
        gold: "未处理",
        delivery: "2026-10-08",
        status: "待阴干",
        note: "边线需保持低浮雕感",
        defects: [
          {
            id: crypto.randomUUID(),
            text: "盒口沿曾有轻微翘线",
            status: "已修复",
            createdAt: "2026-09-25 10:20:00",
            fixedAt: "2026-09-26 15:40:00",
            fixNote: "补漆重贴，保留历史",
            migrated: false
          }
        ],
        logs: ["2026-09-24 09:00:00 创建作品", "2026-09-26 15:40:00 缺陷修复完成：盒口沿曾有轻微翘线（补漆重贴，保留历史）"]
      },
      {
        id: crypto.randomUUID(),
        base: "脱胎盘",
        theme: "折枝梅",
        line: "混合线",
        progress: 95,
        dryDate: "2026-10-02",
        gold: "试扫粉",
        delivery: "2026-10-06",
        status: "待阴干",
        note: "客户要求金粉偏暗",
        defects: [
          {
            id: crypto.randomUUID(),
            text: "左侧枝干断线",
            status: "待修复",
            createdAt: "2026-09-27 14:10:00",
            fixedAt: "",
            fixNote: "",
            migrated: false
          }
        ],
        logs: ["2026-09-22 09:00:00 创建作品", "2026-09-27 14:10:00 记录缺陷（待修复）：左侧枝干断线"]
      },
      {
        id: crypto.randomUUID(),
        base: "竹胎笔筒",
        theme: "云雷纹",
        line: "中线",
        progress: 40,
        dryDate: "2026-10-04",
        gold: "未处理",
        delivery: "2026-10-12",
        status: "贴线中",
        note: "",
        defects: [],
        logs: ["2026-09-26 09:00:00 创建作品"]
      }
    ];
  }

  function load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      data = null;
    }
    if (!Array.isArray(data) || !data.length) {
      data = seed(Workflow.todayStr());
    }
    // 逐条规整：旧版 defect 文字在此迁成待修复记录。
    return data.map(work => Workflow.normalize(work));
  }

  function save(works) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(works));
  }

  window.Store = { STORAGE_KEY, load, save };
})();
