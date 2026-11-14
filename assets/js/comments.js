/* ============================================================
   信号站 SIGNAL.BASE · comments.js
   免登录公开评论组件（后端：Supabase）
   - 游客无需任何账号，填写昵称(可选)+内容直接发布
   - 防垃圾：蜜罐字段 + 60 秒频率限制 + 数据库端长度校验
   - 安全：所有用户输入一律 textContent 渲染，杜绝 XSS
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://zfmdkjktrpqzzbzhwozi.supabase.co";
  var SUPABASE_KEY = "sb_publishable_C6oCK1FrzeJfTp83ibM7Lg_C-pJGJU6";
  var REST = SUPABASE_URL + "/rest/v1/comments";
  var HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY
  };

  /* 每个页面的评论区标识：用路径名区分（如 /posts/hello-world.html） */
  function pageKey() {
    return location.pathname || "/";
  }

  /* 相对时间：刚刚 / n 分钟前 / n 小时前 / 超过一天显示日期 */
  function timeAgo(iso) {
    var t = new Date(iso);
    if (isNaN(t.getTime())) return "";
    var diff = Date.now() - t.getTime();
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + " 小时前";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate()) + " " + p(t.getHours()) + ":" + p(t.getMinutes());
  }

  /* 用 DOM API 安全创建元素（el(tag, class, text)） */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-signal-comments]"), function (mount) {
    /* ---------- 表单区 ---------- */
    var form = el("form", "sc-form");
    form.noValidate = true;

    var hp = el("input");           /* 蜜罐：人类看不见，机器人会填 */
    hp.type = "text";
    hp.name = "website";
    hp.className = "sc-honeypot";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    form.appendChild(hp);

    var rowTop = el("div", "sc-row");
    var nickField = el("div", "sc-field");
    var nickLabel = el("label", null, "称呼 NAME");
    var nick = el("input");
    nick.type = "text";
    nick.maxLength = 30;
    nick.placeholder = "怎么称呼你？（可留空 = 匿名访客）";
    nickField.appendChild(nickLabel);
    nickField.appendChild(nick);
    rowTop.appendChild(nickField);
    form.appendChild(rowTop);

    var bodyField = el("div", "sc-field");
    var bodyLabel = el("label", null, "评论 MESSAGE");
    var body = el("textarea");
    body.maxLength = 500;
    body.placeholder = "写下评论，直接发送——无需注册任何账号……";
    bodyField.appendChild(bodyLabel);
    bodyField.appendChild(body);
    form.appendChild(bodyField);

    var btnRow = el("div", "sc-actions");
    var btn = el("button", "fb-btn", "▸ 发送信号 SEND");
    btn.type = "submit";
    var hint = el("span", "sc-hint", "免登录 · 内容 1~500 字 · 60 秒内请勿连发");
    btnRow.appendChild(btn);
    btnRow.appendChild(hint);
    form.appendChild(btnRow);

    /* ---------- 列表区 ---------- */
    var list = el("div", "sc-list");
    var loading = el("div", "sc-empty", "> 正在接收信号……");
    list.appendChild(loading);

    mount.appendChild(form);
    mount.appendChild(list);

    /* ---------- 读取评论 ---------- */
    function load() {
      list.textContent = "";
      list.appendChild(el("div", "sc-empty", "> 正在接收信号……"));
      fetch(REST + "?select=*&page=eq." + encodeURIComponent(pageKey()) + "&order=created_at.desc&limit=100", {
        headers: HEADERS
      }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      }).then(function (rows) {
        list.textContent = "";
        if (!rows.length) {
          list.appendChild(el("div", "sc-empty", "> 暂无信号 · 等待第一条评论_"));
          return;
        }
        rows.forEach(function (row) {
          var item = el("div", "sc-item");
          var head = el("div", "sc-item-head");
          head.appendChild(el("span", "sc-nick", row.nick || "匿名访客"));
          head.appendChild(el("span", "sc-time", timeAgo(row.created_at)));
          item.appendChild(head);
          var content = el("div", "sc-content");
          /* 换行保留：按 \n 切分逐行追加，天然防 XSS */
          String(row.content || "").split("\n").forEach(function (line, i, arr) {
            content.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) content.appendChild(el("br"));
          });
          item.appendChild(content);
          list.appendChild(item);
        });
      }).catch(function () {
        list.textContent = "";
        list.appendChild(el("div", "sc-empty", "> 信号连接失败，稍后刷新再试_"));
      });
    }

    /* ---------- 提交评论 ---------- */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (hp.value) return;                      /* 蜜罐有值 = 机器人，静默丢弃 */

      var content = body.value.trim();
      if (!content) { body.focus(); return; }

      var last = 0;
      try { last = parseInt(localStorage.getItem("signal-sc-last") || "0", 10) || 0; } catch (err) { }
      if (Date.now() - last < 60 * 1000) {
        hint.textContent = "信号过载：请 " + Math.ceil((60 * 1000 - (Date.now() - last)) / 1000) + " 秒后再发";
        return;
      }

      btn.disabled = true;
      btn.textContent = "▸ 传输中……";
      fetch(REST, {
        method: "POST",
        headers: Object.assign({}, HEADERS, {
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        }),
        body: JSON.stringify({
          page: pageKey(),
          nick: (nick.value.trim() || "匿名访客").slice(0, 30),
          content: content.slice(0, 500)
        })
      }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        body.value = "";
        try { localStorage.setItem("signal-sc-last", String(Date.now())); } catch (err) { }
        hint.textContent = "信号已上墙 ✓";
        load();
      }).catch(function () {
        hint.textContent = "发送失败：检查网络后重试（内容超长也会被拒绝）";
      }).then(function () {
        btn.disabled = false;
        btn.textContent = "▸ 发送信号 SEND";
      });
    });

    load();
  });
})();
