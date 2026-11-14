/* ============================================================
   信号站 SIGNAL.BASE · bg-pokemon.js
   背景游动的「信号幽灵」：像素宝可梦以全息投影形态
   在全站背景中游荡——忽隐忽现、深度分层、轻微 3D 翻转。
   - 尊重系统「减少动态效果」设置（开启则完全不启动）
   - 小屏自动减量；rAF 驱动，仅 transform/opacity，性能友好
   - 图源走 jsDelivr 镜像链（与 games.html 同策略）
   ============================================================ */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var DEX = [25, 94, 133, 137, 202, 280, 447, 479]; /* 皮卡丘/耿鬼/伊布/多边兽/果然翁/拉鲁拉丝/利欧路/洛托姆 */
  var BASES = [
    "https://testingcf.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/",
    "https://fastly.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/",
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"
  ];

  var layer = document.createElement("div");
  layer.id = "pk-bg";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  var W = window.innerWidth;
  var H = window.innerHeight;
  var ghosts = [];

  function mkImg(dex, onReady) {
    var img = document.createElement("img");
    var i = 0;
    img.alt = "";
    img.addEventListener("error", function () {
      i++;
      if (i < BASES.length) { img.src = BASES[i] + dex + ".png"; }
      else if (img.parentNode) { layer.removeChild(img); }
    });
    img.addEventListener("load", function () { onReady(img); });
    img.src = BASES[0] + dex + ".png";
  }

  function spawn(dex) {
    mkImg(dex, function (img) {
      var tier = Math.random(); /* 深度层：0=近 1=远 */
      var size = 34 + Math.round(tier * 60);
      var g = {
        el: img,
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 11) * (1 - tier * 0.55),
        vy: (Math.random() - 0.5) * 9,
        bobAmp: 6 + Math.random() * 14,
        bobFreq: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        size: size,
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

  DEX.forEach(function (d) { spawn(d); });
  var extra = (W < 700 ? 4 : 10) - DEX.length;
  for (var k = 0; k < extra; k++) { spawn(DEX[Math.floor(Math.random() * DEX.length)]); }

  /* ── 巨型背景宝可梦：巨兽巡游（DeepSeek 式水印 × 深海游动）──
     每次刷新随机一位巨兽：吼鲸王 / 暴鲤龙 / 盖欧卡 / 快龙，
     以约 90 秒横穿全屏的速度巡游，伴随起伏与轻微俯仰 */
  var GIANTS = [321, 130, 382, 149];
  var gdex = GIANTS[Math.floor(Math.random() * GIANTS.length)];
  var whale = document.createElement("img");
  var wi = 0;
  whale.id = "pk-whale";
  whale.alt = "";
  whale.setAttribute("aria-hidden", "true");
  whale.addEventListener("error", function () {
    wi++;
    if (wi < BASES.length) { whale.src = BASES[wi] + "other/official-artwork/" + gdex + ".png"; }
    else if (whale.parentNode) { layer.removeChild(whale); }
  });
  whale.src = BASES[0] + "other/official-artwork/" + gdex + ".png";
  layer.appendChild(whale);

  var whaleDir = Math.random() < 0.5 ? -1 : 1;
  var whaleX = whaleDir === 1 ? -0.4 * W : W * 1.02;
  var whaleBaseY = H * (0.32 + Math.random() * 0.18);
  var whaleW = 0; /* 立绘加载完成后按 CSS 实际渲染宽度取值 */
  whale.addEventListener("load", function () {
    whaleW = parseFloat(getComputedStyle(whale).width) || W * 0.9;
  });

  var last = Date.now();
  function tick() {
    var now = Date.now();
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    var t = now / 1000;
    for (var i = 0; i < ghosts.length; i++) {
      var g = ghosts[i];
      g.x += g.vx * dt;
      g.y += g.vy * dt + Math.sin(t * g.bobFreq + g.phase) * g.bobAmp * dt;
      /* 越界环绕：从对侧游回来 */
      if (g.x < -g.size - 60) { g.x = W + 40; }
      if (g.x > W + g.size + 60) { g.x = -40; }
      if (g.y < -g.size - 60) { g.y = H + 30; }
      if (g.y > H + g.size + 60) { g.y = -30; }
      /* 忽隐忽现：正弦包络压到 0 = 完全隐身 */
      var fade = Math.sin(t * g.fadeFreq * Math.PI * 2 + g.phase);
      var op = g.maxOp * Math.max(0, Math.min(1, fade * 1.7));
      /* 全息闪烁 */
      op *= 0.92 + 0.08 * Math.sin(t * 13 + g.phase * 3);
      var face = g.vx >= 0 ? 1 : -1;
      var wob = Math.sin(t * g.wobFreq + g.phase) * 14;
      g.el.style.opacity = op.toFixed(3);
      g.el.style.transform =
        "translate3d(" + g.x.toFixed(1) + "px," + g.y.toFixed(1) + "px,0)" +
        " perspective(700px) rotateY(" + wob.toFixed(1) + "deg)" +
        " scaleX(" + face + ")";
    }

    /* 巨兽巡游：缓慢横穿 + 深潜起伏 + 俯仰 */
    if (whaleW > 0) {
      whaleX += whaleDir * (W / 55) * dt;
      var wy = whaleBaseY + Math.sin(t * 0.14) * (H * 0.05);
      if (whaleDir === 1 && whaleX > W + whaleW * 0.55) {
        whaleX = -whaleW * 0.55;
        whaleBaseY = H * (0.28 + Math.random() * 0.3);
      }
      if (whaleDir === -1 && whaleX < -whaleW * 0.55) {
        whaleX = W * 1.02;
        whaleBaseY = H * (0.28 + Math.random() * 0.3);
      }
      var wFace = whaleDir === 1 ? -1 : 1; /* 官方立绘默认朝左，向右游需镜像 */
      var wTilt = Math.cos(t * 0.14) * 3.5 * wFace;
      whale.style.transform =
        "translate3d(" + whaleX.toFixed(1) + "px," + wy.toFixed(1) + "px,0)" +
        " scaleX(" + wFace + ") rotate(" + wTilt.toFixed(2) + "deg)";
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("resize", function () {
    W = window.innerWidth;
    H = window.innerHeight;
    if (whaleW > 0) { whaleW = parseFloat(getComputedStyle(whale).width) || whaleW; }
  });
})();
