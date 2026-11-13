(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const levelEl = document.getElementById("level");
  const levelProgressEl = document.getElementById("levelProgress");
  const overlay = document.getElementById("overlay");
  const titleEl = document.getElementById("title");
  const subtitleEl = document.getElementById("subtitle");
  const startBtn = document.getElementById("startBtn");

  const COLS = 4;
  const ROWS = 4; // 可视行数
  const cellW = canvas.width / COLS;
  const cellH = canvas.height / ROWS;
  const MAX_LEVEL = 10;
  const CLICKS_PER_LEVEL = 50;

  let tiles = [];
  let score = 0;
  let streak = 0; // 连续点击数
  let level = 1; // 当前等级 1-10
  let best = Number(localStorage.getItem("dont-tap-white-best") || 0);
  let running = false;
  let lastTime = 0;
  let rafId = 0;
  let spawnAcc = 0;
  const spawnGap = cellH; // 每下落一行高度生成新一行

  const audio = (() => {
    let actx = null;
    function ensure() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
    }
    function tone(freq, dur, type = "sine", gain = 0.12) {
      try {
        const ac = ensure();
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        osc.connect(g).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + dur);
      } catch (e) {
        /* 忽略音频错误 */
      }
    }
    return {
      tap() {
        tone(620, 0.09, "triangle", 0.1);
      },
      fail() {
        tone(180, 0.3, "sawtooth", 0.14);
      },
    };
  })();

  bestEl.textContent = best;

  function speedForLevel(lv) {
    return 3.5 + (lv - 1) * 0.8; // 1 级最慢，10 级最快
  }

  function randomBlackColumn() {
    return Math.floor(Math.random() * COLS);
  }

  function reset() {
    tiles = [];
    score = 0;
    streak = 0;
    level = 1;
    spawnAcc = 0;
    updateHud();
  }

  function spawnRow(y) {
    const black = randomBlackColumn();
    tiles.push({ col: black, y, black: true, hit: false });
    for (let c = 0; c < COLS; c++) {
      if (c !== black) tiles.push({ col: c, y, black: false, hit: false });
    }
  }

  function currentTarget() {
    let target = null;
    for (const t of tiles) {
      if (t.black && !t.hit && (!target || t.y > target.y)) target = t;
    }
    return target; // 最下端、未被点击的黑块
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    const into = streak % CLICKS_PER_LEVEL;
    const pct = level >= MAX_LEVEL ? 100 : (into / CLICKS_PER_LEVEL) * 100;
    levelProgressEl.style.width = pct + "%";
  }

  function start() {
    reset();
    running = true;
    overlay.classList.add("hidden");
    // 初始铺满一屏
    for (let i = 0; i < ROWS; i++) spawnRow(-i * cellH);
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function end() {
    running = false;
    audio.fail();
    cancelAnimationFrame(rafId);
    if (score > best) {
      best = score;
      localStorage.setItem("dont-tap-white-best", best);
      bestEl.textContent = best;
    }
    titleEl.textContent = "游戏结束";
    subtitleEl.textContent = `得分 ${score} · 等级 ${level} · 最佳 ${best}`;
    startBtn.textContent = "再来一局";
    overlay.classList.remove("hidden");
  }

  function hit(target) {
    target.hit = true;
    score++;
    streak++;
    level = Math.min(MAX_LEVEL, 1 + Math.floor(streak / CLICKS_PER_LEVEL));
    updateHud();
    audio.tap();
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / (1000 / 60), 3); // 帧步长，防止切后台后跳变
    lastTime = now;

    for (const t of tiles) t.y += speedForLevel(level) * dt;

    // 生成新行
    spawnAcc += speedForLevel(level) * dt;
    if (spawnAcc >= spawnGap) {
      spawnAcc -= spawnGap;
      const topY = Math.min(...tiles.map((t) => t.y));
      spawnRow(topY - cellH);
    }

    // 移除滚出屏幕的方块
    tiles = tiles.filter((t) => t.y < canvas.height);

    // 失误判定：黑块底边越过底线
    for (const t of tiles) {
      if (t.black && !t.hit && t.y + cellH > canvas.height + 1) {
        end();
        draw();
        return;
      }
    }

    draw();
    rafId = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 白色底
    ctx.fillStyle = "#ececec";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 分列线
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, canvas.height);
      ctx.stroke();
    }

    // 方块
    for (const t of tiles) {
      if (!t.black || t.hit) continue;
      ctx.fillStyle = "#1d1d28";
      ctx.fillRect(t.col * cellW + 1, t.y, cellW - 2, cellH - 2);
      // 轻微顶部高光
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(t.col * cellW + 1, t.y, cellW - 2, 6);
    }

    // 高亮当前唯一可点的黑块
    const target = currentTarget();
    if (target) {
      ctx.strokeStyle = "#ffd34d";
      ctx.lineWidth = 3;
      ctx.strokeRect(target.col * cellW + 2, target.y + 2, cellW - 4, cellH - 4);
    }
  }

  // —— 输入处理 ——
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return {
      x: (x / rect.width) * canvas.width,
      y: (y / rect.height) * canvas.height,
    };
  }

  function tileAt(x, y) {
    for (const t of tiles) {
      if (
        t.col === Math.floor(x / cellW) &&
        y >= t.y &&
        y < t.y + cellH
      ) {
        return t;
      }
    }
    return null;
  }

  function onPointer(e) {
    if (!running) return;
    const target = currentTarget();
    if (!target) return;
    const pos = pointerPos(e);
    const cell = tileAt(pos.x, pos.y);
    if (!cell) return;

    if (cell.black && cell === target && !cell.hit) {
      hit(target); // 点中最下端的黑块
    } else if (cell.black && !cell.hit) {
      // 跳过顺序点击更高位置的黑块：不生效
      return;
    } else {
      end(); // 踩到白块
    }
  }

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onPointer(e);
  });
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    onPointer(e);
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    const map = { "1": 0, "2": 1, "3": 2, "4": 3 };
    if (!(e.key in map) || !running) return;
    const target = currentTarget();
    if (!target) return;
    if (target.col === map[e.key]) hit(target); // 按错列：不生效
  });

  startBtn.addEventListener("click", start);

  // 初始画面
  reset();
  draw();
})();
