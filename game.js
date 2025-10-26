// 等待DOM完全加载
document.addEventListener('DOMContentLoaded', function() {
  initGame();
});

let canvas, ctx, scoreEl, bestEl, overlay, startBtn, titleEl;

function initGame() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');

    // 优化画布渲染质量
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // 启用抗锯齿和平滑渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    scoreEl = document.getElementById('score');
    bestEl = document.getElementById('best');
    overlay = document.getElementById('overlay');
    startBtn = document.getElementById('startBtn');
    titleEl = document.getElementById('title');
    
    // 设置玩家初始位置
    player.x = canvas.width / 2 - player.w / 2;
    player.y = canvas.height - player.h - 20;
    
    // 初始化背景星星 - 减少数量提高性能
    if (backgroundStars.length === 0) {
        for (let i = 0; i < 50; i++) {
            backgroundStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 50 + 25,
                opacity: Math.random() * 0.8 + 0.2
            });
        }
    }
    
    // 只在第一次初始化时设置事件监听器
    if (!window.gameInitialized) {
        setupEventListeners();
        window.gameInitialized = true;
        // 启动主游戏循环（只启动一次）
        if (!window.mainLoopRunning) {
            window.mainLoopRunning = true;
            mainLoop();
        }
    }
}

// 游戏状态
let gameState = 'menu'; // menu, playing, settings
let running = false;
let gameOver = false;
let paused = false;
let score = 0;
let best = parseInt(localStorage.getItem('best-score') || '0', 10);
let spawnTimer = 0;
let obstacles = [];
let particles = [];
let powerups = [];
let level = 1;
let levelThreshold = 300;
let shakeIntensity = 0;
let shakeTimer = 0;
let playerShield = 0;
let slowMotion = 0;
let combo = 0;
let comboTimer = 0;
let scoreMultiplier = 1;
let backgroundStars = [];

let achievements = {
  unlocked: JSON.parse(localStorage.getItem('achievements') || '[]'),
  lastAchievement: '',
  lastShown: 0
};

let gameSettings = {
  difficulty: 'normal',
  particleEffects: true,
  soundEnabled: true
};
// 排行榜和分享功能
let leaderboard = JSON.parse(localStorage.getItem('leaderboard') || '[]');
let showLeaderboard = false;
let shareMessage = '';
let shareTimer = 0;

// 暂停菜单
let showPauseMenu = false;
let pauseMenuSelection = 0; // 0: 继续游戏, 1: 重新开始, 2: 返回主菜单

// 移动端触屏控制
let touchControls = {
  enabled: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  isMoving: false,
  lastTapTime: 0,
  doubleTapDelay: 300
};

// 音频系统
let audioSystem = {
  enabled: true,
  musicEnabled: true,
  sfxEnabled: true,
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  backgroundMusic: null,
  audioContext: null,
  sounds: {}
};

// 游戏统计系统
let gameStats = {
  totalGamesPlayed: parseInt(localStorage.getItem('totalGamesPlayed') || '0'),
  totalScore: parseInt(localStorage.getItem('totalScore') || '0'),
  totalPlayTime: parseInt(localStorage.getItem('totalPlayTime') || '0'),
  obstaclesAvoided: parseInt(localStorage.getItem('obstaclesAvoided') || '0'),
  powerUpsCollected: parseInt(localStorage.getItem('powerUpsCollected') || '0'),
  maxCombo: parseInt(localStorage.getItem('maxCombo') || '0'),
  maxLevel: parseInt(localStorage.getItem('maxLevel') || '0'),
  currentSessionStart: 0,
  currentSessionScore: 0,
  currentSessionObstacles: 0,
  currentSessionPowerUps: 0
};// 粒子特效系统
let particleEffects = {
  trails: [], // 玩家移动轨迹
  sparks: [], // 火花效果
  debris: []  // 碎片效果
};

// 玩家对象 - 初始位置将在画布设置后更新
const player = {
  x: 0, // 将在init函数中设置
  y: 0, // 将在init函数中设置
  w: 32,
  h: 32,
  speed: 250,
  color: '#22d3ee'
};

// 键盘控制
const keys = new Set();

// 检测是否为移动设备
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

function setupEventListeners() {
  window.addEventListener('keydown', (e) => {
    if (gameState === 'menu') {
      if (e.key === ' ') startGame();
      if (e.key.toLowerCase() === 's') showSettings();
      if (e.key.toLowerCase() === 'l') showLeaderboard = !showLeaderboard;
      if (e.key.toLowerCase() === 't') gameState = 'statistics';
      if (e.key.toLowerCase() === 'c' && showLeaderboard && leaderboard.length > 0) {
        shareScore();
      }
    } else if (gameState === 'settings') {
      if (e.key === 'Escape') gameState = 'menu';
      if (e.key >= '1' && e.key <= '3') {
        const difficulties = ['easy', 'normal', 'hard'];
        gameSettings.difficulty = difficulties[parseInt(e.key) - 1];
      }
      if (e.key === 'm' || e.key === 'M') {
        toggleMusic();
      }
      if (e.key === 'n' || e.key === 'N') {
        toggleSFX();
      }
    } else if (gameState === 'statistics') {
      if (e.key === 'Escape') gameState = 'menu';
    } else if (gameState === 'playing') {
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'p') togglePause();
      if (e.key.toLowerCase() === 'r') restartGame();
    } else if (gameState === 'paused') {
      if (showPauseMenu) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          pauseMenuSelection = Math.max(0, pauseMenuSelection - 1);
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          pauseMenuSelection = Math.min(2, pauseMenuSelection + 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          handlePauseMenuSelection();
        } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          togglePause();
        }
      } else if (e.key === 'p' || e.key === 'P') {
        togglePause();
      }
    }
  });
  
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  // 触屏事件监听
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

  // 启用触屏控制
  if (isMobileDevice()) {
    touchControls.enabled = true;
  }
  
  startBtn.addEventListener('click', () => startGame());
}

function togglePause() {
  paused = !paused;
  if (paused) {
    showPauseMenu = true;
    pauseMenuSelection = 0;
    overlay.classList.remove('hidden');
    titleEl.textContent = '游戏已暂停 - 按P继续';
  } else {
    showPauseMenu = false;
    overlay.classList.add('hidden');
    lastTs = performance.now();
  }
}

function handlePauseMenuSelection() {
  switch (pauseMenuSelection) {
    case 0: // 继续游戏
      togglePause();
      break;
    case 1: // 重新开始
      restartGame();
      break;
    case 2: // 返回主菜单
      returnToMainMenu();
      break;
  }
}

function restartGame() {
  showPauseMenu = false;
  startGame();
}

function returnToMainMenu() {
  showPauseMenu = false;
  gameState = 'menu';
}

// 触屏事件处理函数
function handleTouchStart(e) {
  e.preventDefault();
  if (!touchControls.enabled) return;
  
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  touchControls.startX = touch.clientX - rect.left;
  touchControls.startY = touch.clientY - rect.top;
  touchControls.currentX = touchControls.startX;
  touchControls.currentY = touchControls.startY;
  touchControls.isMoving = true;
  
  // 双击检测
  const currentTime = Date.now();
  if (currentTime - touchControls.lastTapTime < touchControls.doubleTapDelay) {
    // 双击事件
    if (gameState === 'playing') {
      togglePause();
    }
  }
  touchControls.lastTapTime = currentTime;
  
  // 处理菜单点击
  if (gameState === 'menu') {
    handleMenuTouch(touchControls.startX, touchControls.startY);
  } else if (gameState === 'paused' && showPauseMenu) {
    handlePauseMenuTouch(touchControls.startX, touchControls.startY);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!touchControls.enabled || !touchControls.isMoving) return;
  
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  touchControls.currentX = touch.clientX - rect.left;
  touchControls.currentY = touch.clientY - rect.top;
  
  // 在游戏进行时控制玩家移动
  if (gameState === 'playing') {
    const deltaX = touchControls.currentX - touchControls.startX;
    const deltaY = touchControls.currentY - touchControls.startY;
    
    // 根据触摸偏移控制玩家位置
    const sensitivity = 0.8;
    player.x = Math.max(0, Math.min(canvas.width - player.w, 
      player.x + deltaX * sensitivity));
    player.y = Math.max(0, Math.min(canvas.height - player.h, 
      player.y + deltaY * sensitivity));
    
    // 更新起始位置以实现连续移动
    touchControls.startX = touchControls.currentX;
    touchControls.startY = touchControls.currentY;
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  touchControls.isMoving = false;
}

function handleMenuTouch(x, y) {
  // 简单的触摸区域检测，可以根据需要优化
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  if (Math.abs(x - centerX) < 100 && Math.abs(y - centerY) < 50) {
    startGame();
  }
}

function handlePauseMenuTouch(x, y) {
  const centerX = canvas.width / 2;
  const menuStartY = canvas.height / 2 - 40;
  
  for (let i = 0; i < 3; i++) {
    const optionY = menuStartY + i * 50;
    if (Math.abs(x - centerX) < 150 && Math.abs(y - optionY) < 25) {
      pauseMenuSelection = i;
      handlePauseMenuSelection();
      break;
    }
  }
}

function showSettings() {
  gameState = 'settings';
}

function startGame() {
  gameState = 'playing';
  running = true;
  gameOver = false;
  paused = false;
  score = 0;
  level = 1;
  obstacles = [];
  particles = [];
  powerups = [];
  spawnTimer = 0;
  shakeIntensity = 0;
  shakeTimer = 0;
  playerShield = 0;
  slowMotion = 0;
  combo = 0;
  comboTimer = 0;
  scoreMultiplier = 1;
  
  // 重置粒子特效
  particleEffects.trails = [];
  particleEffects.sparks = [];
  particleEffects.debris = [];
  
  // 重置背景星星位置（不重新创建）
  for (const star of backgroundStars) {
    star.x = Math.random() * canvas.width;
    star.y = Math.random() * canvas.height;
  }
  
  player.x = canvas.width / 2 - player.w / 2;
  player.y = canvas.height - 80;
  overlay.classList.add('hidden');
  lastTs = performance.now();
  
  // 初始化统计系统
  initGameStats();
  
  // 初始化音频系统并播放背景音乐
  if (!audioSystem.audioContext) {
    initAudioSystem();
  }
  startBackgroundMusic();
}

function endGame() {
  running = false;
  gameOver = true;
  gameState = 'menu';
  
  // 记录游戏结束统计
  recordGameEnd();
  
  // 添加到排行榜
  addToLeaderboard(Math.floor(score));
  
  overlay.classList.remove('hidden');
  titleEl.textContent = `游戏结束！分数：${Math.floor(score)}（最高：${best}）`;
}

function spawnObstacle() {
  const obstacleTypes = [
    { type: 'normal', weight: 60 },
    { type: 'fast', weight: 20 },
    { type: 'big', weight: 15 },
    { type: 'zigzag', weight: 5 }
  ];
  
  const totalWeight = obstacleTypes.reduce((sum, type) => sum + type.weight, 0);
  let random = Math.random() * totalWeight;
  let selectedType = 'normal';
  
  for (const type of obstacleTypes) {
    random -= type.weight;
    if (random <= 0) {
      selectedType = type.type;
      break;
    }
  }
  
  const baseSpeed = 150 + level * 20;
  const difficultyMultiplier = gameSettings.difficulty === 'easy' ? 0.7 : 
                               gameSettings.difficulty === 'hard' ? 1.5 : 1.0;
  
  let obstacle = {
    x: Math.random() * (canvas.width - 40),
    y: -40,
    w: 40,
    h: 40,
    speed: baseSpeed * difficultyMultiplier,
    color: '#ef4444',
    type: selectedType,
    zigzagDirection: 1,
    zigzagSpeed: 100
  };
  
  switch (selectedType) {
    case 'fast':
      obstacle.speed *= 1.8;
      obstacle.color = '#f97316';
      obstacle.w = 30;
      obstacle.h = 30;
      break;
    case 'big':
      obstacle.w = 60;
      obstacle.h = 60;
      obstacle.speed *= 0.6;
      obstacle.color = '#7c2d12';
      break;
    case 'zigzag':
      obstacle.color = '#8b5cf6';
      obstacle.w = 35;
      obstacle.h = 35;
      break;
  }
  
  obstacles.push(obstacle);
}

function spawnPowerup() {
  const types = ['shield', 'slow'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  powerups.push({
    x: Math.random() * (canvas.width - 30),
    y: -30,
    w: 30,
    h: 30,
    speed: 100 + level * 10,
    type: type,
    rotation: 0
  });
}

function collectPowerup(powerup) {
  playSound('powerup');
  createExplosion(powerup.x + powerup.w/2, powerup.y + powerup.h/2, '#10b981');
  
  // 记录道具收集统计
  recordPowerUpCollected();
  
  if (powerup.type === 'shield') {
    playerShield = 5;
    checkAchievement('shield_collected');
  } else if (powerup.type === 'slow') {
    slowMotion = 3;
    checkAchievement('slow_collected');
  }
}

function update(dt) {
  // 慢动作效果
  if (slowMotion > 0) {
    slowMotion -= dt;
    dt *= 0.3;
  }
  
  // 屏幕震动
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    shakeIntensity *= 0.9;
  }
  
  // 护盾时间递减
  if (playerShield > 0) {
    playerShield -= dt;
  }
  
  // 连击计时器递减
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      scoreMultiplier = 1;
    }
  }
  
  // 分享消息计时器
  if (shareTimer > 0) {
    shareTimer -= dt;
  }
  
  // 更新背景星星
  for (const star of backgroundStars) {
    star.y += star.speed * dt;
    if (star.y > canvas.height) {
      star.y = -5;
      star.x = Math.random() * canvas.width;
    }
  }
  
  // 检查等级提升
  const newLevel = Math.floor(score / levelThreshold) + 1;
  if (newLevel > level) {
    level = newLevel;
    createLevelUpEffect();
    playSound('levelup');
    checkAchievement('level_' + level);
  }
  
  // 玩家移动 - 改进的边界控制
  const oldX = player.x;
  const oldY = player.y;
  
  // 定义边界缓冲区，确保飞船完全在屏幕内
  const boundaryBuffer = 2; // 2像素的缓冲区
  const minX = boundaryBuffer;
  const maxX = canvas.width - player.w - boundaryBuffer;
  const minY = boundaryBuffer;
  const maxY = canvas.height - player.h - boundaryBuffer;
  
  // 计算新位置
  let newX = player.x;
  let newY = player.y;
  
  if (keys.has('a') || keys.has('arrowleft')) {
    newX = player.x - player.speed * dt;
  }
  if (keys.has('d') || keys.has('arrowright')) {
    newX = player.x + player.speed * dt;
  }
  if (keys.has('w') || keys.has('arrowup')) {
    newY = player.y - player.speed * dt;
  }
  if (keys.has('s') || keys.has('arrowdown')) {
    newY = player.y + player.speed * dt;
  }
  
  // 应用边界限制
  player.x = Math.max(minX, Math.min(maxX, newX));
  player.y = Math.max(minY, Math.min(maxY, newY));
  
  // 创建玩家移动轨迹
  if (oldX !== player.x || oldY !== player.y) {
    createPlayerTrail(oldX + player.w/2, oldY + player.h/2);
  }
  
  // 障碍生成
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(0.2, 0.9 - level * 0.1);
  }
  
  // 道具生成
  if (Math.random() < dt * 0.067) {
    spawnPowerup();
  }
  
  // 更新障碍
  for (const obs of obstacles) {
    obs.y += obs.speed * dt;
    
    if (obs.type === 'zigzag') {
      obs.x += obs.zigzagDirection * obs.zigzagSpeed * dt;
      if (obs.x <= 0 || obs.x >= canvas.width - obs.w) {
        obs.zigzagDirection *= -1;
      }
    }
  }
  
  // 移除越界障碍并增加连击
  obstacles = obstacles.filter((o) => {
    if (o.y > canvas.height + 50) {
      combo++;
      comboTimer = 3;
      scoreMultiplier = Math.min(5, 1 + combo * 0.1);
      score += 10 * scoreMultiplier;
      // 记录成功躲避的障碍物
      recordObstacleAvoided();
      return false;
    }
    return true;
  });
  
  // 更新道具
  for (const powerup of powerups) {
    powerup.y += powerup.speed * dt;
    powerup.rotation += dt * 3;
  }
  powerups = powerups.filter((p) => p.y < canvas.height + 50);
  
  // 更新粒子
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  
  // 更新粒子特效
  updateParticleEffects(dt);
  
  // 道具碰撞检测
  for (let i = powerups.length - 1; i >= 0; i--) {
    const powerup = powerups[i];
    if (rectsOverlap(player, powerup)) {
      collectPowerup(powerup);
      powerups.splice(i, 1);
    }
  }
  
  // 障碍碰撞检测
  for (const o of obstacles) {
    if (rectsOverlap(player, o)) {
      if (playerShield > 0) {
        playerShield = 0;
        createExplosion(o.x + o.w/2, o.y + o.h/2, '#fbbf24');
        createSparks(o.x + o.w/2, o.y + o.h/2, '#fbbf24');
        playSound('shield');
        obstacles.splice(obstacles.indexOf(o), 1);
        continue;
      }
      
      combo = 0;
      comboTimer = 0;
      scoreMultiplier = 1;
      
      best = Math.max(best, Math.floor(score));
      localStorage.setItem('best-score', String(best));
      createExplosion(player.x + player.w/2, player.y + player.h/2, player.color);
      createDebris(player.x + player.w/2, player.y + player.h/2, player.color);
      createScreenShake(15);
      playSound('explosion');
      checkAchievement('score_' + Math.floor(score / 100) * 100);
      endGame();
      break;
    }
  }
}

// 缓存渐变对象以提高性能
let backgroundGradient = null;
let playerGradient = null;

function draw() {
  // 屏幕震动效果
  if (shakeTimer > 0) {
    ctx.save();
    const offsetX = (Math.random() - 0.5) * shakeIntensity;
    const offsetY = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(offsetX, offsetY);
  }
  
  // 背景 - 缓存渐变星空效果
  if (!backgroundGradient) {
    backgroundGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    backgroundGradient.addColorStop(0, '#0a0a0f');
    backgroundGradient.addColorStop(0.5, '#1a1a2e');
    backgroundGradient.addColorStop(1, '#16213e');
  }
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 绘制背景星星 - 优化渲染
  if (backgroundStars.length > 0) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const star of backgroundStars) {
      ctx.globalAlpha = star.opacity;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.restore();
  }
  
  // 绘制边界视觉反馈（仅在游戏进行时显示）
  if (gameState === 'playing') {
    const boundaryBuffer = 2;
    
    // 边界发光效果
    ctx.save();
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([5, 5]);
    
    // 绘制边界线
    ctx.beginPath();
    // 左边界
    ctx.moveTo(boundaryBuffer, 0);
    ctx.lineTo(boundaryBuffer, canvas.height);
    // 右边界
    ctx.moveTo(canvas.width - boundaryBuffer, 0);
    ctx.lineTo(canvas.width - boundaryBuffer, canvas.height);
    // 上边界
    ctx.moveTo(0, boundaryBuffer);
    ctx.lineTo(canvas.width, boundaryBuffer);
    // 下边界
    ctx.moveTo(0, canvas.height - boundaryBuffer);
    ctx.lineTo(canvas.width, canvas.height - boundaryBuffer);
    ctx.stroke();
    
    ctx.restore();
  }
  
  // 绘制玩家飞船
  ctx.save();
  
  // 飞船主体渐变 - 缓存渐变对象
  if (!playerGradient) {
    playerGradient = ctx.createLinearGradient(0, 0, 0, player.h);
    playerGradient.addColorStop(0, '#00ff88');
    playerGradient.addColorStop(0.5, '#00cc66');
    playerGradient.addColorStop(1, '#009944');
  }
  
  // 绘制飞船主体
  ctx.fillStyle = playerGradient;
  roundedRect(player.x, player.y, player.w, player.h, 6, playerGradient);
  
  // 飞船边框光效
  ctx.strokeStyle = '#00ffaa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(player.x, player.y, player.w, player.h, 6);
  ctx.stroke();
  
  // 飞船引擎光效
  if (gameState === 'playing') {
      ctx.fillStyle = '#00aaff';
      ctx.fillRect(player.x + player.w/4, player.y + player.h, player.w/2, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(player.x + player.w/3, player.y + player.h + 2, player.w/3, 4);
  }
  
  ctx.restore();
  
  // 护盾效果
  if (playerShield > 0) {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(player.x - 5, player.y - 5, player.w + 10, player.h + 10);
    ctx.setLineDash([]);
  }
  
  // 障碍 - 优化渲染
  for (const o of obstacles) {
    // 只在需要时保存上下文
    let needRestore = false;
    
    if (o.type === 'fast') {
      ctx.fillStyle = o.color + '80';
      ctx.fillRect(o.x - 5, o.y - 10, o.w + 10, 5);
    } else if (o.type === 'big') {
      ctx.fillStyle = '#00000040';
      ctx.fillRect(o.x + 3, o.y + 3, o.w, o.h);
    } else if (o.type === 'zigzag') {
      ctx.save();
      needRestore = true;
      const alpha = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
      ctx.globalAlpha = alpha;
    }
    
    // 简化障碍物渲染 - 使用纯色而不是渐变
    ctx.fillStyle = o.color;
    roundedRect(o.x, o.y, o.w, o.h, 4, o.color);
    
    // 障碍物边框
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, 4);
    ctx.stroke();
    
    if (needRestore) {
      ctx.restore();
    }
  }
  
  // 道具
  for (const powerup of powerups) {
    ctx.save();
    
    // 道具发光效果
    const time = Date.now() * 0.005;
    const glowIntensity = 0.5 + 0.5 * Math.sin(time);
    
    // 外层光晕
    const powerupColor = powerup.type === 'shield' ? '#fbbf24' : '#06b6d4';
    ctx.shadowColor = powerupColor;
    ctx.shadowBlur = 20 * glowIntensity;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.translate(powerup.x + powerup.w/2, powerup.y + powerup.h/2);
    ctx.rotate(powerup.rotation);
    
    // 道具渐变
    const powerUpGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, powerup.w/2);
    powerUpGradient.addColorStop(0, '#ffffff');
    powerUpGradient.addColorStop(0.3, powerupColor);
    powerUpGradient.addColorStop(1, powerupColor + '66');
    
    // 绘制道具主体
    ctx.fillStyle = powerUpGradient;
    ctx.beginPath();
    ctx.roundRect(-powerup.w/2, -powerup.h/2, powerup.w, powerup.h, 8);
    ctx.fill();
    
    // 重置阴影
    ctx.shadowBlur = 0;
    
    // 道具图标
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (powerup.type === 'shield') {
      ctx.fillText('🛡', 0, 0);
    } else if (powerup.type === 'slow') {
      ctx.fillText('⏰', 0, 0);
    }
    
    ctx.restore();
  }
  
  // 粒子效果 - 优化批量渲染
  if (particles.length > 0) {
    ctx.save();
    for (const particle of particles) {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = particle.life;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.restore();
  }
  
  // 绘制增强粒子特效
  drawParticleEffects();
  
  // UI文字 - 优化渲染质量
  drawText(`分数: ${Math.floor(score)}`, 20, 40, 24, '#ffffff', 'left');
  drawText(`最高: ${best}`, 20, 70, 24, '#ffffff', 'left');
  drawText(`等级: ${level}`, 20, 100, 24, '#ffffff', 'left');

// 优化文字渲染函数
function drawText(text, x, y, size = 24, color = '#fff', align = 'center', shadow = true) {
    ctx.save();
    ctx.font = `bold ${size}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    if (shadow) {
        // 文字阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(text, x + 2, y + 2);
    }
    
    // 主文字
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    
    ctx.restore();
}
  
  // 快捷键提示
  ctx.fillStyle = '#888888';
  ctx.font = '14px Arial';
  ctx.textAlign = 'right';
  if (touchControls.enabled) {
    ctx.fillText('触摸屏幕移动', canvas.width - 20, 30);
    ctx.fillText('双击暂停', canvas.width - 20, 50);
  } else {
    ctx.fillText('P: 暂停  R: 重启', canvas.width - 20, 30);
  }
  
  // 状态指示器
  let statusY = 130;
  if (playerShield > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🛡 护盾: ${playerShield.toFixed(1)}s`, 20, statusY);
    statusY += 30;
  }
  if (slowMotion > 0) {
    ctx.fillStyle = '#06b6d4';
    ctx.fillText(`⏰ 慢动作: ${slowMotion.toFixed(1)}s`, 20, statusY);
    statusY += 30;
  }
  
  // 连击显示
  if (combo > 0) {
    ctx.fillStyle = '#10b981';
    ctx.font = '28px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${combo}x 连击!`, canvas.width - 20, 50);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '20px Arial';
    ctx.fillText(`${scoreMultiplier.toFixed(1)}x 倍数`, canvas.width - 20, 80);
  }
  
  // 成就提示
  if (achievements.lastShown && Date.now() - achievements.lastShown < 3000) {
    ctx.fillStyle = '#10b981';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🏆 ${achievements.lastAchievement}`, canvas.width/2, 100);
  }
  
  // 分享消息提示
  if (shareTimer > 0) {
    ctx.fillStyle = '#06b6d4';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(shareMessage, canvas.width/2, 130);
  }
  
  if (paused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (showPauseMenu) {
      // 暂停菜单
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('游戏暂停', canvas.width/2, canvas.height/2 - 120);
      
      const menuOptions = ['继续游戏', '重新开始', '返回主菜单'];
      ctx.font = '32px Arial';
      
      for (let i = 0; i < menuOptions.length; i++) {
        if (i === pauseMenuSelection) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('▶ ' + menuOptions[i], canvas.width/2, canvas.height/2 - 40 + i * 50);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillText(menuOptions[i], canvas.width/2, canvas.height/2 - 40 + i * 50);
        }
      }
      
      ctx.fillStyle = '#888888';
      ctx.font = '18px Arial';
      ctx.fillText('使用 ↑↓ 或 W/S 选择，Enter 确认，ESC 或 P 返回', canvas.width/2, canvas.height/2 + 120);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = '36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('游戏暂停', canvas.width/2, canvas.height/2);
      ctx.font = '18px Arial';
      ctx.fillText('按 P 键继续', canvas.width/2, canvas.height/2 + 40);
    }
  }
  
  ctx.restore();
}

function drawMenuAndSettings() {
  // 背景
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 绘制背景星星
  ctx.fillStyle = '#ffffff';
  for (const star of backgroundStars) {
    ctx.globalAlpha = star.opacity;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  if (gameState === 'menu') {
    // 半透明背景遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 计算菜单中心位置
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // 游戏标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 添加标题阴影效果
    ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText('星际穿越', centerX, centerY - 120);
    
    // 清除阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // 副标题
    ctx.font = '28px Arial, sans-serif';
    ctx.fillStyle = '#22d3ee';
    ctx.fillText('按空格开始游戏', centerX, centerY - 60);
    
    // 最高分显示
    ctx.font = '24px Arial, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🏆 最高分: ${best}`, centerX, centerY - 20);
    
    // 控制说明
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('使用 WASD 或方向键移动', centerX, centerY + 30);
    ctx.fillText('按 P 键暂停游戏', centerX, centerY + 55);
    
    // 功能按键说明
    ctx.font = '16px Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('按 S 键打开设置 | 按 L 键查看排行榜 | 按 T 键查看统计', centerX, centerY + 90);
  } else if (gameState === 'settings') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('游戏设置', canvas.width/2, 100);
    
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    
    // 难度设置
    ctx.fillText('难度:', 100, 200);
    const difficulties = ['简单', '普通', '困难'];
    const difficultyKeys = ['easy', 'normal', 'hard'];
    for (let i = 0; i < difficulties.length; i++) {
      const isSelected = gameSettings.difficulty === difficultyKeys[i];
      ctx.fillStyle = isSelected ? '#10b981' : '#ffffff';
      ctx.fillText(`${i + 1}. ${difficulties[i]}`, 200, 200 + i * 40);
    }
    
    // 音频设置
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('音频设置:', 100, 350);
    
    ctx.font = '20px Arial';
    ctx.fillStyle = audioSystem.musicEnabled ? '#4ade80' : '#ef4444';
    ctx.fillText(`背景音乐: ${audioSystem.musicEnabled ? '开启' : '关闭'}`, 200, 380);
    
    ctx.fillStyle = audioSystem.sfxEnabled ? '#4ade80' : '#ef4444';
    ctx.fillText(`音效: ${audioSystem.sfxEnabled ? '开启' : '关闭'}`, 200, 410);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('按 1-3 选择难度，M 切换音乐，N 切换音效', canvas.width/2, 460);
    ctx.fillText('按 ESC 返回主菜单', canvas.width/2, 480);
   } else if (gameState === 'statistics') {
    // 统计页面
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    
    // 标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📊 游戏统计', centerX, 80);
    
    // 统计信息
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    
    const stats = [
      { label: '当前分数', value: score, color: '#22d3ee' },
      { label: '最高分数', value: best, color: '#fbbf24' },
      { label: '当前等级', value: level, color: '#10b981' },
      { label: '游戏难度', value: gameSettings.difficulty === 'easy' ? '简单' : gameSettings.difficulty === 'normal' ? '普通' : '困难', color: '#ef4444' }
    ];
    
    let yPos = 150;
    for (const stat of stats) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(stat.label + ':', 100, yPos);
      ctx.fillStyle = stat.color;
      ctx.fillText(stat.value.toString(), 300, yPos);
      yPos += 40;
    }
    
    // 游戏状态信息
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Arial';
    yPos += 20;
    ctx.fillText('游戏状态:', 100, yPos);
    ctx.fillStyle = running ? '#10b981' : '#ef4444';
    ctx.fillText(running ? '进行中' : '未开始', 300, yPos);
    
    yPos += 40;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('音效状态:', 100, yPos);
    ctx.fillStyle = audioSystem.sfxEnabled ? '#10b981' : '#ef4444';
    ctx.fillText(audioSystem.sfxEnabled ? '开启' : '关闭', 300, yPos);
    
    yPos += 40;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('背景音乐:', 100, yPos);
    ctx.fillStyle = audioSystem.musicEnabled ? '#10b981' : '#ef4444';
    ctx.fillText(audioSystem.musicEnabled ? '开启' : '关闭', 300, yPos);
    
    // 返回提示
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('按 ESC 返回主菜单', centerX, canvas.height - 50);
   }
   
   // 排行榜显示
   if (showLeaderboard) {
     ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
     ctx.fillRect(0, 0, canvas.width, canvas.height);
     ctx.fillStyle = '#ffffff';
     ctx.font = '36px Arial';
     ctx.textAlign = 'center';
     ctx.fillText('🏆 排行榜', canvas.width/2, 80);
     
     ctx.font = '24px Arial';
     if (leaderboard.length === 0) {
       ctx.fillText('暂无记录', canvas.width/2, 200);
     } else {
       for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
         const entry = leaderboard[i];
         const rank = i + 1;
         const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
         ctx.fillStyle = rank <= 3 ? '#fbbf24' : '#ffffff';
         ctx.fillText(`${medal} ${entry.score}分 - ${entry.date}`, canvas.width/2, 150 + i * 35);
       }
     }
     
     ctx.fillStyle = '#ffffff';
     ctx.font = '18px Arial';
     ctx.fillText('按 L 键关闭排行榜', canvas.width/2, canvas.height - 50);
     
     // 分享按钮提示
     if (leaderboard.length > 0) {
       ctx.font = '16px Arial';
       ctx.fillStyle = '#06b6d4';
       ctx.fillText('按 C 键复制最高分到剪贴板', canvas.width/2, canvas.height - 80);
     }
   }
 }

// 工具函数
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function roundedRect(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function createExplosion(x, y, color) {
  // 限制粒子总数以提高性能
  if (particles.length > 200) return;
  
  for (let i = 0; i < 10; i++) { // 减少粒子数量
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 300,
      vy: (Math.random() - 0.5) * 300,
      life: 1.0,
      color: color
    });
  }
}

function createLevelUpEffect() {
  // 限制粒子总数以提高性能
  if (particles.length > 200) return;
  
  for (let i = 0; i < 15; i++) { // 减少粒子数量
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 400,
      vy: (Math.random() - 0.5) * 400,
      life: 1.0,
      color: '#fbbf24'
    });
  }
}

function createScreenShake(intensity) {
  shakeIntensity = intensity;
  shakeTimer = 0.5;
}

function playSound(type) {
  console.log(`🔊 播放音效: ${type}`);
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    const frequencies = {
      'explosion': 150,
      'levelup': 800,
      'powerup': 600,
      'shield': 400
    };
    
    oscillator.frequency.setValueAtTime(frequencies[type] || 300, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (e) {
    // 音频API不可用时静默失败
  }
}

function checkAchievement(achievementId) {
  if (achievements.unlocked.includes(achievementId)) return;
  
  const achievementNames = {
    'level_5': '达到等级5',
    'level_10': '达到等级10',
    'score_100': '得分100分',
    'score_500': '得分500分',
    'score_1000': '得分1000分',
    'shield_collected': '首次收集护盾',
    'slow_collected': '首次收集慢动作'
  };
  
  const name = achievementNames[achievementId];
  if (name) {
    achievements.unlocked.push(achievementId);
    achievements.lastAchievement = name;
    achievements.lastShown = Date.now();
    playSound('levelup');
    
    localStorage.setItem('achievements', JSON.stringify(achievements.unlocked));
  }
}

function addToLeaderboard(score) {
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}`;
  
  leaderboard.push({
    score: score,
    date: dateStr,
    timestamp: now.getTime()
  });
  
  // 按分数排序，保留前20名
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 20);
  
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}

function shareScore() {
  if (leaderboard.length === 0) return;
  
  const topScore = leaderboard[0];
  const shareText = `🎮 我在躲避游戏中获得了 ${topScore.score} 分的最高分！你能超越我吗？`;
  
  try {
    // 尝试使用现代剪贴板API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareText).then(() => {
        shareMessage = '✅ 分数已复制到剪贴板！';
        shareTimer = 3;
      }).catch(() => {
        fallbackCopyToClipboard(shareText);
      });
    } else {
      fallbackCopyToClipboard(shareText);
    }
  } catch (e) {
    shareMessage = '❌ 复制失败，请手动分享';
    shareTimer = 3;
  }
}

function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      shareMessage = '✅ 分数已复制到剪贴板！';
    } else {
      shareMessage = '❌ 复制失败，请手动分享';
    }
    shareTimer = 3;
  } catch (e) {
    shareMessage = '❌ 复制失败，请手动分享';
    shareTimer = 3;
  }
}

// 粒子特效系统函数
function createPlayerTrail(x, y) {
  particleEffects.trails.push({
    x: x,
    y: y,
    life: 0.3,
    maxLife: 0.3,
    size: 2
  });
}

function createSparks(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const speed = 100 + Math.random() * 50;
    particleEffects.sparks.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5,
      maxLife: 0.5,
      color: color,
      size: 3 + Math.random() * 2
    });
  }
}

function createDebris(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 120;
    particleEffects.debris.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      maxLife: 1.0,
      color: color,
      size: 4 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 10
    });
  }
}

function updateParticleEffects(dt) {
  // 更新轨迹粒子
  for (const trail of particleEffects.trails) {
    trail.life -= dt;
  }
  particleEffects.trails = particleEffects.trails.filter(t => t.life > 0);
  
  // 更新火花粒子
  for (const spark of particleEffects.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.life -= dt;
    spark.vy += 200 * dt; // 重力效果
  }
  particleEffects.sparks = particleEffects.sparks.filter(s => s.life > 0);
  
  // 更新碎片粒子
  for (const debris of particleEffects.debris) {
    debris.x += debris.vx * dt;
    debris.y += debris.vy * dt;
    debris.life -= dt;
    debris.rotation += debris.rotationSpeed * dt;
    debris.vy += 150 * dt; // 重力效果
    debris.vx *= 0.98; // 空气阻力
  }
  particleEffects.debris = particleEffects.debris.filter(d => d.life > 0);
}

function drawParticleEffects() {
  ctx.save();
  
  // 绘制玩家轨迹
  if (particleEffects.trails.length > 0) {
    ctx.fillStyle = player.color;
    for (const trail of particleEffects.trails) {
      const alpha = trail.life / trail.maxLife;
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillRect(trail.x - trail.size/2, trail.y - trail.size/2, trail.size, trail.size);
    }
  }
  
  // 绘制火花
  for (const spark of particleEffects.sparks) {
    const alpha = spark.life / spark.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spark.color;
    ctx.fillRect(spark.x - spark.size/2, spark.y - spark.size/2, spark.size, spark.size);
  }
  
  // 绘制碎片
  for (const debris of particleEffects.debris) {
    const alpha = debris.life / debris.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = debris.color;
    
    ctx.translate(debris.x, debris.y);
    ctx.rotate(debris.rotation);
    ctx.fillRect(-debris.size/2, -debris.size/2, debris.size, debris.size);
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换矩阵，比save/restore更快
  }
  
  ctx.restore();
  
  ctx.globalAlpha = 1;
}

// 游戏统计系统函数
function initGameStats() {
  gameStats.currentSessionStart = Date.now();
  gameStats.currentSessionScore = 0;
  gameStats.currentSessionObstacles = 0;
  gameStats.currentSessionPowerUps = 0;
}

function updateGameStats() {
  // 更新当前会话统计
  gameStats.currentSessionScore = score;
  
  // 保存到本地存储
  localStorage.setItem('totalGamesPlayed', gameStats.totalGamesPlayed.toString());
  localStorage.setItem('totalScore', gameStats.totalScore.toString());
  localStorage.setItem('totalPlayTime', gameStats.totalPlayTime.toString());
  localStorage.setItem('obstaclesAvoided', gameStats.obstaclesAvoided.toString());
  localStorage.setItem('powerUpsCollected', gameStats.powerUpsCollected.toString());
  localStorage.setItem('maxCombo', gameStats.maxCombo.toString());
  localStorage.setItem('maxLevel', gameStats.maxLevel.toString());
}

function recordGameEnd() {
  gameStats.totalGamesPlayed++;
  gameStats.totalScore += score;
  
  const sessionTime = Math.floor((Date.now() - gameStats.currentSessionStart) / 1000);
  gameStats.totalPlayTime += sessionTime;
  
  if (score > parseInt(localStorage.getItem('highScore') || '0')) {
    localStorage.setItem('highScore', score.toString());
  }
  
  if (level > gameStats.maxLevel) {
    gameStats.maxLevel = level;
  }
  
  updateGameStats();
}

function recordObstacleAvoided() {
  gameStats.obstaclesAvoided++;
  gameStats.currentSessionObstacles++;
}

function recordPowerUpCollected() {
  gameStats.powerUpsCollected++;
  gameStats.currentSessionPowerUps++;
}

function getPlayTimeString(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

// 音频系统函数
function initAudioSystem() {
  try {
    audioSystem.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    createSynthSounds();
  } catch (e) {
    console.warn('音频系统初始化失败:', e);
    audioSystem.enabled = false;
  }
}

function createSynthSounds() {
  // 创建合成音效，避免需要外部音频文件
  audioSystem.sounds = {
    jump: createTone(440, 0.1, 'sine'),
    collect: createTone(660, 0.15, 'square'),
    explosion: createTone(150, 0.3, 'sawtooth'),
    shield: createTone(880, 0.2, 'triangle'),
    levelUp: createChord([523, 659, 784], 0.5),
    achievement: createChord([440, 554, 659], 0.8)
  };
}

function createTone(frequency, duration, waveType = 'sine') {
  return () => {
    if (!audioSystem.enabled || !audioSystem.sfxEnabled) return;
    
    const oscillator = audioSystem.audioContext.createOscillator();
    const gainNode = audioSystem.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioSystem.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioSystem.audioContext.currentTime);
    oscillator.type = waveType;
    
    gainNode.gain.setValueAtTime(0, audioSystem.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(audioSystem.sfxVolume * audioSystem.masterVolume, audioSystem.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioSystem.audioContext.currentTime + duration);
    
    oscillator.start(audioSystem.audioContext.currentTime);
    oscillator.stop(audioSystem.audioContext.currentTime + duration);
  };
}

function createChord(frequencies, duration) {
  return () => {
    if (!audioSystem.enabled || !audioSystem.sfxEnabled) return;
    
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = audioSystem.audioContext.createOscillator();
        const gainNode = audioSystem.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioSystem.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(freq, audioSystem.audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioSystem.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(audioSystem.sfxVolume * audioSystem.masterVolume * 0.3, audioSystem.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioSystem.audioContext.currentTime + duration);
        
        oscillator.start(audioSystem.audioContext.currentTime);
        oscillator.stop(audioSystem.audioContext.currentTime + duration);
      }, index * 100);
    });
  };
}

function playSound(soundName) {
  if (audioSystem.sounds[soundName]) {
    audioSystem.sounds[soundName]();
  }
}

function startBackgroundMusic() {
  if (!audioSystem.enabled || !audioSystem.musicEnabled) return;
  
  // 创建简单的背景音乐循环
  playBackgroundLoop();
}

function playBackgroundLoop() {
  if (!audioSystem.enabled || !audioSystem.musicEnabled) return;
  
  const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; // C大调音阶
  let noteIndex = 0;
  
  function playNextNote() {
    if (!audioSystem.enabled || !audioSystem.musicEnabled || gameState !== 'playing') return;
    
    const oscillator = audioSystem.audioContext.createOscillator();
    const gainNode = audioSystem.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioSystem.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(notes[noteIndex], audioSystem.audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, audioSystem.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(audioSystem.musicVolume * audioSystem.masterVolume * 0.1, audioSystem.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioSystem.audioContext.currentTime + 0.8);
    
    oscillator.start(audioSystem.audioContext.currentTime);
    oscillator.stop(audioSystem.audioContext.currentTime + 0.8);
    
    noteIndex = (noteIndex + 1) % notes.length;
    
    setTimeout(playNextNote, 1000);
  }
  
  playNextNote();
}

function toggleAudio() {
  audioSystem.enabled = !audioSystem.enabled;
  if (!audioSystem.enabled) {
    stopBackgroundMusic();
  }
}

function toggleMusic() {
  audioSystem.musicEnabled = !audioSystem.musicEnabled;
  if (!audioSystem.musicEnabled) {
    stopBackgroundMusic();
  } else if (gameState === 'playing') {
    startBackgroundMusic();
  }
}

function toggleSFX() {
  audioSystem.sfxEnabled = !audioSystem.sfxEnabled;
}

function stopBackgroundMusic() {
  // 背景音乐会在下次循环时自动停止
}

// 主循环
let lastTs = performance.now();

function mainLoop() {
  if (gameState === 'menu' || gameState === 'settings') {
    // 更新背景星星
    for (const star of backgroundStars) {
      star.y += star.speed * 0.016;
      if (star.y > canvas.height) {
        star.y = -5;
        star.x = Math.random() * canvas.width;
      }
    }
    drawMenuAndSettings();
  } else if (gameState === 'playing' && running && !paused) {
    const ts = performance.now();
    const dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    update(dt);
    draw();
  }
  requestAnimationFrame(mainLoop);
}

