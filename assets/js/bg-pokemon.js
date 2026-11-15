/* ============================================================
   信号站 SIGNAL.BASE · bg-pokemon.js
   背景特效系统：
   ① 小型「信号幽灵」：像素宝可梦全息游荡，忽隐忽现
   ② 巨型「深海巨兽」：粒子点阵成形 —— 汇聚 → 游动 → 消融，
      每轮随机一位巨兽（吼鲸王/暴鲤龙/盖欧卡/快龙）
   - 尊重系统「减少动态效果」设置（开启则完全不启动）
   - rAF 驱动；小幽灵走 DOM transform，巨兽走 Canvas 粒子
   - 图源走 jsDelivr 镜像链（国内可达优先）
   ============================================================ */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var layer = document.createElement("div");
  layer.id = "pk-bg";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  var W = window.innerWidth;
  var H = window.innerHeight;

  var BASES = [
    "https://testingcf.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/",
    "https://fastly.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/",
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
  ];

  /* ══════════ ① 小型信号幽灵（DOM 层） ══════════ */
  var GHOST_DEX = [25, 94, 133, 137, 202, 280, 447, 479];
  var ghosts = [];

  function mkGhostImg(dex, onReady) {
    var img = document.createElement("img");
    var i = 0;
    /* 优先 Gen5 官方动画 GIF（翅膀扇动/尾巴摇摆自带），失败逐级回退静态像素图 */
    var urls = [
      BASES[0] + "versions/generation-v/black-white/animated/" + dex + ".gif",
      BASES[1] + "versions/generation-v/black-white/animated/" + dex + ".gif",
      BASES[2] + "versions/generation-v/black-white/animated/" + dex + ".gif",
      BASES[0] + dex + ".png",
      BASES[1] + dex + ".png",
      BASES[2] + dex + ".png"
    ];
    img.alt = "";
    img.addEventListener("error", function () {
      i++;
      if (i < urls.length) { img.src = urls[i]; }
      else if (img.parentNode) { layer.removeChild(img); }
    });
    img.addEventListener("load", function () { onReady(img); });
    img.src = urls[0];
  }

  function spawnGhost(dex) {
    mkGhostImg(dex, function (img) {
      var tier = Math.random();
      var size = 34 + Math.round(tier * 60);
      var g = {
        el: img,
        x: Math.random() * W,
        y: Math.random() * H,
        spd: (5 + Math.random() * 11) * (1 - tier * 0.55),
        wa: Math.random() * Math.PI * 2,
        dartT: 0,
        bobAmp: 6 + Math.random() * 14,
        bobFreq: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        size: size,
        tier: tier,
        maxOp: 0.2 + (1 - tier) * 0.38,
        fadeFreq: 0.12 + Math.random() * 0.22,
        wobFreq: 0.4 + Math.random() * 0.6,
        blur: tier * 1.7
      };
      img.style.width = size + "px";
      var glow = "drop-shadow(0 0 " + (3 + Math.round((1 - tier) * 6)) + "px rgba(57,197,187,0.55))";
      if (g.blur > 0.3) { glow += " blur(" + g.blur.toFixed(1) + "px)"; }
      img.style.filter = glow;
      layer.appendChild(img);
      ghosts.push(g);
    });
  }

  GHOST_DEX.forEach(function (d) { spawnGhost(d); });
  var gExtra = (W < 700 ? 4 : 10) - GHOST_DEX.length;
  for (var gi = 0; gi < gExtra; gi++) { spawnGhost(GHOST_DEX[Math.floor(Math.random() * GHOST_DEX.length)]); }

  /* ══════════ ② 巨型深海巨兽（Canvas 粒子系统） ══════════ */
  var GIANTS = [321, 130, 382, 149]; /* 吼鲸王 / 暴鲤龙 / 盖欧卡 / 快龙 */
  var giantCanvas = document.createElement("canvas");
  giantCanvas.id = "pk-giant";
  layer.appendChild(giantCanvas);
  var gctx = giantCanvas.getContext("2d");
  var dpr = Math.min(2, window.devicePixelRatio || 1);

  function sizeGiant() {
    giantCanvas.width = W * dpr;
    giantCanvas.height = H * dpr;
    giantCanvas.style.width = W + "px";
    giantCanvas.style.height = H + "px";
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeGiant();

  var gParts = [];      /* 粒子数组：tx/ty 相对成形原点的目标位，颜色，散布参数 */
  var gFormW = 0;
  var gFormH = 0;
  var gPhase = "idle";  /* idle → loading → assemble → swim → dissolve → idle */
  var gPhaseT = 0;
  var gX = 0;           /* 成形原点的屏幕位置（随游动推进） */
  var gBaseY = 0;
  var gAnchorY = 0;     /* 高度锚点：不规则飞行围绕它上下游移 */
  var whaleDir = Math.random() < 0.5 ? 1 : -1; /* +1 向右，-1 向左（来回折返） */
  var camX = 0, camY = 0;   /* 裸眼 3D 视差相机偏移（鼠标驱动，静置自动漫游） */
  var mouseX = 0, mouseY = 0, lastMouseT = -9;
  window.addEventListener("mousemove", function (e) {
    mouseX = (e.clientX / Math.max(1, W) - 0.5) * 2;
    mouseY = (e.clientY / Math.max(1, H) - 0.5) * 2;
    lastMouseT = Date.now() / 1000;
  });
  var gNextT = 1.5;     /* 下一次巨兽登场的时间戳（秒） */
  var gIdx = Math.floor(Math.random() * GIANTS.length);
  var artCache = {};
  var dbg = { phase: gPhase, parts: 0, dex: 0, errs: [] };
  try { window.__pkDebug = dbg; } catch (e) { }

  function loadArt(dex, cb) {
    if (artCache[dex]) { return cb(artCache[dex]); }
    var img = new Image();
    var i = 0;
    img.crossOrigin = "anonymous";
    img.addEventListener("error", function () {
      i++;
      dbg.errs.push("art " + dex + " mirror " + i + " failed");
      if (i < BASES.length) { img.src = BASES[i] + "other/official-artwork/" + dex + ".png"; }
      else { cb(null); }
    });
    img.addEventListener("load", function () {
      artCache[dex] = img;
      cb(img);
    });
    img.src = BASES[0] + "other/official-artwork/" + dex + ".png";
  }

  /* 把立绘采样成粒子：按网格取不透明像素，自动加大间距控制总量 */
  function buildParticles(img) {
    var targetW = Math.min(820, Math.max(460, W * 0.55));
    var scale = targetW / img.naturalWidth;
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    var octx = off.getContext("2d");
    octx.drawImage(img, 0, 0, w, h);
    var data;
    try {
      data = octx.getImageData(0, 0, w, h).data;
    } catch (e) {
      dbg.errs.push("getImageData tainted: " + (e && e.message));
      return false; /* 跨域污染时放弃本轮 */
    }
    var spacing = 7;
    gParts = [];
    for (;;) {
      gParts = [];
      for (var y = 0; y < h; y += spacing) {
        for (var x = 0; x < w; x += spacing) {
          var idx = (y * w + x) * 4;
          if (data[idx + 3] < 90) { continue; }
          var br = (data[idx] * 0.3 + data[idx + 1] * 0.55 + data[idx + 2] * 0.15) / 255;
          gParts.push({
            /* 采样抖动：打破规则网格，得到有机的半调点云 */
            tx: x - w / 2 + (Math.random() - 0.5) * spacing * 0.75,
            ty: y - h / 2 + (Math.random() - 0.5) * spacing * 0.75,
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            br: br,
            sx: (Math.random() - 0.5) * W * 0.9,
            sy: (Math.random() - 0.5) * H * 0.8,
            delay: Math.random() * 1.1,
            dvx: (Math.random() - 0.5) * 220,
            dvy: (Math.random() - 0.5) * 220 - 60,
            wob: Math.random() * Math.PI * 2,
            z: Math.random(),
            tf: 0.8 + Math.random() * 1.8,
            tw: Math.random() * Math.PI * 2,
            fall: 0.68 + Math.random() * 0.34
          });
        }
      }
      if (gParts.length <= 2400 || spacing >= 15) { break; }
      spacing += 2;
    }
    dbg.parts = gParts.length;
    gFormW = w;
    gFormH = h;
    return gParts.length > 60;
  }

  function giantUpdate(dt, t) {
    gPhaseT += dt;
    if (gPhase === "idle" && t >= gNextT) {
      var dex = GIANTS[gIdx % GIANTS.length];
      gIdx++;
      gPhase = "loading";
      loadArt(dex, function (img) {
        if (!img || !buildParticles(img)) {
          gPhase = "idle";
          gNextT = t + 5;
          return;
        }
        gPhase = "assemble";
        gPhaseT = 0;
        gX = whaleDir === 1 ? gFormW * 0.32 : W - gFormW * 0.32;
        gAnchorY = H * (0.28 + Math.random() * 0.24);
        gBaseY = gAnchorY;
      });
    } else if (gPhase === "assemble" && gPhaseT > 2.8) {
      gPhase = "swim";
      gPhaseT = 0;
    } else if (gPhase === "swim") {
      /* 纪录片式巡游：恒定庄严的速度，缓缓爬升/俯冲（大海深处的鲸） */
      gX += whaleDir * (W / 50) * dt;
      gBaseY = gAnchorY + Math.sin(t * 0.17 + 1.2) * (H * 0.085) + Math.sin(t * 0.31) * (H * 0.05);
      /* 来回折返：到边界就掉头 */
      if (whaleDir === 1 && gX > W - gFormW * 0.3) { whaleDir = -1; }
      if (whaleDir === -1 && gX < gFormW * 0.3) { whaleDir = 1; }
      if (gPhaseT > 30) {
        gPhase = "dissolve";
        gPhaseT = 0;
      }
    } else if (gPhase === "dissolve" && gPhaseT > 2.2) {
      gParts = [];
      gPhase = "idle";
      gNextT = t + 2.5 + Math.random() * 2.5;
    }
    dbg.phase = gPhase;
    dbg.phaseT = Math.round(gPhaseT * 10) / 10;
    dbg.parts = gParts.length;
    dbg.camX = Math.round(camX * 10) / 10;
    dbg.dir = whaleDir;
  }

  function giantDraw(t) {
    gctx.clearRect(0, 0, W, H);
    if (!gParts.length || gPhase === "loading" || gPhase === "idle") { return; }
    /* 飞行姿态：随爬升/俯冲产生俯仰角，叠加转弯侧倾 */
    var dySlope = H * (0.085 * 0.17 * Math.cos(t * 0.17 + 1.2) + 0.045 * 0.41 * Math.cos(t * 0.41));
    var rot = Math.atan2(dySlope, W / 50) * whaleDir + Math.sin(t * 0.29) * 0.055 * whaleDir;
    gctx.save();
    gctx.translate(gX, gBaseY);
    gctx.rotate(rot);
    gctx.translate(-gX, -gBaseY);
    for (var i = 0; i < gParts.length; i++) {
      var q = gParts[i];
      var wob = Math.sin(t * 1.2 + q.tx * 0.010) * 3; /* 身体涟漪：缓慢同相行波 */
      var wFace = whaleDir === 1 ? -1 : 1;
      /* 纪录片式鲸泳：身体近乎刚体，只有尾部缓缓摆动 */
      var tailU = (q.tx * wFace + gFormW * 0.5) / Math.max(1, gFormW);
      var f = Math.max(0, Math.min(1, (tailU - 0.5) / 0.5));
      f = f * f * (3 - 2 * f); /* smoothstep，前半身完全不动 */
      var sway = Math.sin(t * 1.2 - q.tx * 0.008 + q.wob * 0.15) * (0.5 + f * 13);
      var fluke = f * Math.sin(t * 1.2 - q.tx * 0.008) * 7; /* 尾鳍缓缓摆动 */
      var px, py, al, dsz;
      /* 自然感：个体独立闪烁（萤火虫式） */
      var twk = 0.72 + 0.28 * Math.sin(t * q.tf + q.tw);
      /* 边缘剥离：轮廓外围的粒子随机明灭脱落（像视频里鲸鱼边缘不断掉渣） */
      var exN = Math.abs(q.tx) / (gFormW * 0.5);
      var eyN = Math.abs(q.ty) / Math.max(1, gFormH * 0.5);
      var edgeN = Math.max(exN, eyN);
      /* 裸眼 3D：按粒子深度 z 施加视差偏移，近处动得多、远处动得少 */
      if (gPhase === "assemble") {
        var p = Math.min(1, Math.max(0, (gPhaseT - q.delay) / 1.5));
        var e = 1 - Math.pow(1 - p, 3); /* easeOutCubic */
        px = gX + q.tx * wFace + sway + q.sx * (1 - e) + camX * q.z;
        py = gBaseY + q.ty + q.sy * (1 - e) + wob + fluke + camY * q.z * 0.6;
        al = (0.15 + q.br * 0.5) * e;
      } else if (gPhase === "swim") {
        px = gX + q.tx * wFace + sway + camX * q.z;
        py = gBaseY + q.ty + wob + fluke + camY * q.z * 0.6;
        al = 0.15 + q.br * 0.5;
      } else { /* dissolve */
        px = gX + q.tx * wFace + sway + q.dvx * gPhaseT + camX * q.z;
        py = gBaseY + q.ty + wob + fluke + q.dvy * gPhaseT + camY * q.z * 0.6;
        al = (0.15 + q.br * 0.5) * (1 - gPhaseT / 2.0);
      }
      al *= twk * (0.55 + q.z * 0.45);
      if (edgeN > q.fall) { al *= 0.25 + 0.75 * Math.abs(Math.sin(t * 2.3 + q.wob)); }
      if (al <= 0.02) { continue; }
      /* 半调网点：亮处粒子大而密，暗处小而疏 */
      dsz = (1.0 + q.br * 1.8) * (0.7 + q.z * 0.8);
      /* 立绘原色 × 青色全息色调混合 */
      gctx.globalAlpha = al;
      gctx.fillStyle = "rgb(" +
        Math.round(q.r * 0.4 + 57 * 0.6) + "," +
        Math.round(q.g * 0.4 + 197 * 0.6) + "," +
        Math.round(q.b * 0.4 + 187 * 0.6) + ")";
      gctx.beginPath();
      gctx.arc(px, py, dsz, 0, Math.PI * 2);
      gctx.fill();
    }
    gctx.restore();
    gctx.globalAlpha = 1;
  }

  /* ══════════ ③ 鼠标特效层：光标拖尾 + 点击迸裂 ══════════ */
  var fxCanvas = document.createElement("canvas");
  fxCanvas.id = "pk-fx";
  document.body.appendChild(fxCanvas);
  var fctx = fxCanvas.getContext("2d");
  function sizeFx() {
    fxCanvas.width = W * dpr;
    fxCanvas.height = H * dpr;
    fxCanvas.style.width = W + "px";
    fxCanvas.style.height = H + "px";
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeFx();

  var trail = [];  /* 光标拖尾 / 点击迸裂粒子 */
  var rings = [];  /* 点击涟漪 */

  window.addEventListener("mousemove", function (e) {
    trail.push({
      x: e.clientX, y: e.clientY,
      vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 - 10,
      life: 0.65 + Math.random() * 0.4,
      size: 1 + Math.random() * 1.8,
      white: Math.random() < 0.25
    });
    if (trail.length > 340) { trail.splice(0, trail.length - 340); }
  });

  window.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) { return; }
    var t3 = e.target;
    if (t3 && t3.closest && t3.closest("a,button,input,textarea,select,label,summary")) { return; }
    rings.push({ x: e.clientX, y: e.clientY, r: 4, life: 0.55 });
    for (var i = 0; i < 26; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp2 = 50 + Math.random() * 190;
      trail.push({
        x: e.clientX, y: e.clientY,
        vx: Math.cos(ang) * sp2, vy: Math.sin(ang) * sp2,
        life: 0.5 + Math.random() * 0.5,
        size: 1.2 + Math.random() * 2,
        white: Math.random() < 0.3
      });
    }
    if (trail.length > 460) { trail.splice(0, trail.length - 460); }
  });

  function fxDraw(dt) {
    fctx.clearRect(0, 0, W, H);
    for (var i = trail.length - 1; i >= 0; i--) {
      var q = trail[i];
      q.life -= dt;
      if (q.life <= 0) { trail.splice(i, 1); continue; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= (1 - 1.6 * dt);
      q.vy *= (1 - 1.6 * dt);
      q.vy -= 22 * dt; /* 微微上飘，像信号余辉 */
      var a = Math.min(1, q.life / 0.45) * 0.85;
      fctx.globalAlpha = a;
      fctx.fillStyle = q.white ? "#eafff9" : "#39c5bb";
      fctx.fillRect(q.x, q.y, q.size, q.size);
    }
    for (var j = rings.length - 1; j >= 0; j--) {
      var r2 = rings[j];
      r2.life -= dt;
      r2.r += 150 * dt;
      if (r2.life <= 0) { rings.splice(j, 1); continue; }
      fctx.globalAlpha = Math.max(0, r2.life / 0.55) * 0.6;
      fctx.strokeStyle = "#39c5bb";
      fctx.lineWidth = 1.5;
      fctx.beginPath();
      fctx.arc(r2.x, r2.y, r2.r, 0, Math.PI * 2);
      fctx.stroke();
    }
    fctx.globalAlpha = 1;
  }

  /* ══════════ 主循环 ══════════ */
  var last = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    var t = now / 1000;

    /* 裸眼 3D 视差相机：跟随鼠标，静置 2.5 秒后自动漫游 */
    var idle = (t - lastMouseT) > 2.5;
    var camTX = idle ? Math.sin(t * 0.32) : mouseX;
    var camTY = idle ? Math.cos(t * 0.24) * 0.6 : mouseY;
    camX += (camTX * 26 - camX) * Math.min(1, dt * 3);
    camY += (camTY * 16 - camY) * Math.min(1, dt * 3);

    /* 小幽灵 */
    for (var i = 0; i < ghosts.length; i++) {
      var g = ghosts[i];
      /* 活体游动：方向随机漫游 + 偶发冲刺 */
      g.wa += (Math.random() - 0.5) * 2.4 * dt;
      if (Math.random() < dt * 0.16) { g.dartT = 0.5 + Math.random() * 0.4; }
      if (g.dartT > 0) { g.dartT -= dt; }
      var spdNow = g.spd * (g.dartT > 0 ? 2.6 : 1);
      g.x += Math.cos(g.wa) * spdNow * dt;
      g.y += Math.sin(g.wa) * 0.6 * spdNow * dt + Math.sin(t * g.bobFreq + g.phase) * g.bobAmp * dt;
      if (g.x < -g.size - 60) { g.x = W + 40; }
      if (g.x > W + g.size + 60) { g.x = -40; }
      if (g.y < -g.size - 60) { g.y = H + 30; }
      if (g.y > H + g.size + 60) { g.y = -30; }
      var fade = Math.sin(t * g.fadeFreq * Math.PI * 2 + g.phase);
      var op = g.maxOp * Math.max(0, Math.min(1, fade * 1.7));
      op *= 0.92 + 0.08 * Math.sin(t * 13 + g.phase * 3);
      var face = Math.cos(g.wa) >= 0 ? 1 : -1;
      var wob = Math.sin(t * g.wobFreq + g.phase) * 14;
      var rock = Math.sin(t * 2.4 + g.phase) * 3.2;
      var sq = Math.sin(t * 3.1 + g.phase) * 0.05;
      g.el.style.opacity = op.toFixed(3);
      g.el.style.transform =
        "translate3d(" + (g.x + camX * (1 - g.tier) * 0.5).toFixed(1) + "px," +
        (g.y + camY * (1 - g.tier) * 0.4).toFixed(1) + "px,0)" +
        " perspective(700px) rotateY(" + wob.toFixed(1) + "deg)" +
        " rotate(" + rock.toFixed(2) + "deg)" +
        " scaleX(" + (face * (1 + sq)).toFixed(3) + ") scaleY(" + (1 - sq).toFixed(3) + ")";
    }

    /* 巨兽 */
    giantUpdate(dt, t);
    giantDraw(t);

    /* 鼠标特效 */
    fxDraw(dt);

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("resize", function () {
    W = window.innerWidth;
    H = window.innerHeight;
    sizeGiant();
    sizeFx();
  });
})();
