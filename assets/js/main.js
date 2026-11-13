/* ============================================================
   信号站 SIGNAL.BASE · main.js
   功能：终端打字机 / HUD 数据统计 / 滚动显现
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 终端打字机 ---------- */
  var typer = document.getElementById("typer");
  if (typer) {
    var phrases = [];
    try { phrases = JSON.parse(typer.getAttribute("data-lines") || "[]"); } catch (e) { phrases = []; }

    if (phrases.length && !reduceMotion) {
      var pi = 0, ci = 0, deleting = false;
      var tick = function () {
        var cur = phrases[pi];
        ci += deleting ? -1 : 1;
        typer.textContent = cur.slice(0, ci);
        var delay = deleting ? 32 : 110;
        if (!deleting && ci === cur.length) { delay = 2600; deleting = true; }
        else if (deleting && ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 500; }
        setTimeout(tick, delay);
      };
      tick();
    } else if (phrases.length) {
      typer.textContent = phrases[0];
    }
  }

  /* ---------- HUD：建站天数 ---------- */
  var startDate = new Date("2026-11-11T00:00:00");
  var days = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1);
  Array.prototype.forEach.call(document.querySelectorAll("[data-days]"), function (el) {
    el.textContent = String(days).padStart(3, "0");
  });

  /* ---------- HUD：文章计数（自动统计卡片数量） ---------- */
  var count = document.querySelectorAll(".post-card:not(.placeholder)").length;
  Array.prototype.forEach.call(document.querySelectorAll("[data-post-count]"), function (el) {
    el.textContent = String(count).padStart(2, "0");
  });

  /* ---------- 滚动显现 ---------- */
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08 });
    Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) {
      io.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll(".reveal"), function (el) {
      el.classList.add("in");
    });
  }

  /* ---------- 左侧导览栏 ---------- */
  var rail = document.getElementById("rail");
  if (rail) {
    var railNav = document.getElementById("rail-nav");
    var articleBody = document.querySelector(".article-body");

    /* 文章页：从小节标题自动生成目录（标题自带中文序号，不再加数字编号） */
    if (railNav && articleBody) {
      var headings = articleBody.querySelectorAll("h2");
      Array.prototype.forEach.call(headings, function (h, i) {
        if (!h.id) { h.id = "post-toc-" + (i + 1); }
        var a = document.createElement("a");
        a.className = "rail-link";
        a.href = "#" + h.id;
        a.appendChild(document.createTextNode(h.textContent));
        railNav.appendChild(a);
      });
    }

    /* 滚动侦测：高亮当前所在区域 */
    var links = Array.prototype.slice.call(rail.querySelectorAll(".rail-link"));
    var byId = {};
    links.forEach(function (l) {
      byId[l.getAttribute("href").slice(1)] = l;
    });
    if ("IntersectionObserver" in window && links.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && byId[en.target.id]) {
            links.forEach(function (l) { l.classList.remove("active"); });
            byId[en.target.id].classList.add("active");
          }
        });
      }, { rootMargin: "-15% 0px -65% 0px", threshold: 0 });
      Object.keys(byId).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { spy.observe(el); }
      });
    }

    /* 移动端抽屉开关 */
    var fab = document.getElementById("menuBtn");
    var scrim = document.getElementById("scrim");
    var closeRail = function () {
      rail.classList.remove("open");
      if (scrim) { scrim.classList.remove("show"); }
    };
    if (fab) {
      fab.addEventListener("click", function () {
        var open = rail.classList.toggle("open");
        if (scrim) { scrim.classList.toggle("show", open); }
      });
    }
    if (scrim) { scrim.addEventListener("click", closeRail); }
    Array.prototype.forEach.call(rail.querySelectorAll("a"), function (a) {
      a.addEventListener("click", function () {
        if (window.innerWidth < 1080) { closeRail(); }
      });
    });
  }

  /* ---------- 管理入口：仅站长浏览器可见 ---------- */
  /* 登录过管理终端的浏览器会在 7 天内显示入口链接；游客浏览器完全无痕迹 */
  var ADMIN_FLAG = "signal-admin-last-auth";
  var ADMIN_TTL = 7 * 24 * 60 * 60 * 1000;
  var railFoot = document.querySelector(".rail-foot");
  if (railFoot) {
    var lastAuth = 0;
    try { lastAuth = parseInt(localStorage.getItem(ADMIN_FLAG) || "0", 10) || 0; } catch (e) { }
    if (lastAuth && Date.now() - lastAuth < ADMIN_TTL) {
      var adminPrefix = location.pathname.indexOf("/posts/") > -1 ? "../" : "";
      var adminLink = document.createElement("a");
      adminLink.href = adminPrefix + "admin.html";
      adminLink.textContent = "⚙ 管理 ADMIN";
      railFoot.insertBefore(adminLink, railFoot.querySelector(".rail-ver"));
    }
  }

  /* ---------- 计划模块：点击循环状态并本地保存 ---------- */
  var PLAN_LABELS = { todo: "待启动", doing: "进行中", done: "已完成" };
  var PLAN_NEXT = { todo: "doing", doing: "done", done: "todo" };
  var planStore = {};
  try { planStore = JSON.parse(localStorage.getItem("signal-plans-v1") || "{}") || {}; } catch (e) { planStore = {}; }

  Array.prototype.forEach.call(document.querySelectorAll(".plan-item"), function (item) {
    var id = item.getAttribute("data-plan-id");
    var stateLabel = item.querySelector(".plan-status");
    var sync = function () {
      if (stateLabel) {
        stateLabel.textContent = PLAN_LABELS[item.getAttribute("data-state")] || "待启动";
      }
    };
    if (id && planStore[id]) { item.setAttribute("data-state", planStore[id]); }
    sync();
    item.addEventListener("click", function () {
      var next = PLAN_NEXT[item.getAttribute("data-state")] || "todo";
      item.setAttribute("data-state", next);
      sync();
      if (id) {
        planStore[id] = next;
        try { localStorage.setItem("signal-plans-v1", JSON.stringify(planStore)); } catch (e) { /* 忽略 */ }
      }
    });
  });
})();
