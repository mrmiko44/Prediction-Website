/* ============= WINGO AI PREDICTION - COMPLETE APP V2 ============= */
(function() {
'use strict';

// ===== AUTH STATE =====
let authToken = localStorage.getItem('wingo_token') || null;
let currentUser = JSON.parse(localStorage.getItem('wingo_user') || 'null');

// ===== APP STATE =====
const state = {
  page: document.body.dataset.page || 'landing',
  gameType: localStorage.getItem('wingo_gameType') || '1min',
  predictionType: 'color',
  modelType: 'model_1',
  prediction: null,
  recentPredictions: [],
  history: [],
  stats: null,
  countdown: 0,
  loading: false,
  config: null,
};

// ===== UTILITY =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function getColorClass(color) {
  if (!color) return 'red';
  const c = color.toLowerCase();
  if (c.includes('green') && c.includes('violet')) return 'green-violet';
  if (c.includes('red') && c.includes('violet')) return 'red-violet';
  if (c.includes('green')) return 'green';
  if (c.includes('violet')) return 'violet';
  return 'red';
}

function getColorLabel(color) {
  if (!color) return 'Red';
  const c = color.toLowerCase();
  if (c.includes('green')) return 'Green';
  if (c.includes('violet') && !c.includes('green') && !c.includes('red')) return 'Violet';
  if (c.includes('red')) return 'Red';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function getColorEmoji(color) {
  const c = (color || '').toLowerCase();
  if (c.includes('green')) return '🟢';
  if (c.includes('violet')) return '🟣';
  return '🔴';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function navigate(page) {
  window.location.href = '/' + (page === 'landing' ? '' : page);
}

function showToast(message, type = 'info') {
  const existing = $('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} rounded-xl px-5 py-3 shadow-lg text-sm font-medium flex items-center gap-2`;
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function isLoggedIn() { return !!authToken && !!currentUser; }
function isPremium() { return currentUser && currentUser.subscription && currentUser.subscription.active; }
function isAdmin() { return currentUser && currentUser.isAdmin; }

// ===== API =====
async function fetchAPI(url, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const r = await fetch(url, { ...options, headers });
    const data = await r.json();
    return data;
  } catch(e) {
    console.error('API Error:', e);
    return { success: false, error: e.message };
  }
}

async function refreshUser() {
  if (!authToken) return;
  const data = await fetchAPI('/api/auth/me');
  if (data.success) {
    currentUser = data.user;
    localStorage.setItem('wingo_user', JSON.stringify(currentUser));
  } else {
    logout();
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('wingo_token');
  localStorage.removeItem('wingo_user');
  navigate('landing');
}

// ===== COUNTDOWN TIMER =====
function calcCountdown(gameType) {
  const now = new Date();
  const secs = now.getSeconds();
  const mins = now.getMinutes();
  switch(gameType) {
    case '30s': return secs < 30 ? 30 - secs : 60 - secs;
    case '1min': return 60 - secs;
    case '3min': { const mod = mins % 3; return ((mod === 0 ? 3 : 3 - mod) * 60) - secs; }
    case '5min': { const mod = mins % 5; return ((mod === 0 ? 5 : 5 - mod) * 60) - secs; }
    default: return 60;
  }
}
function getMaxTime(gt) {
  return { '30s': 30, '1min': 60, '3min': 180, '5min': 300 }[gt] || 60;
}

// ===== RENDER ROUTER =====
function render() {
  const app = $('#app');
  if (!app) return;

  // Redirect check
  if (['admin'].includes(state.page) && (!isLoggedIn() || !isAdmin())) {
    navigate('login');
    return;
  }

  switch(state.page) {
    case 'landing': app.innerHTML = renderLanding(); break;
    case 'login': app.innerHTML = renderLogin(); break;
    case 'signup': app.innerHTML = renderSignup(); break;
    case 'predictions': app.innerHTML = renderPredictions(); initPredictions(); break;
    case 'history': app.innerHTML = renderHistory(); loadHistory(); break;
    case 'statistics': app.innerHTML = renderStatistics(); loadStats(); break;
    case 'subscription': app.innerHTML = renderSubscription(); break;
    case 'profile': app.innerHTML = renderProfile(); break;
    case 'settings': app.innerHTML = renderSettings(); break;
    case 'admin': app.innerHTML = renderAdmin(); loadAdminData(); break;
    case 'wallet': app.innerHTML = renderWallet(); loadPaymentHistory(); break;
    case 'about': app.innerHTML = renderAbout(); break;
    default: app.innerHTML = renderLanding();
  }
}

// ===== NAV COMPONENT =====
function renderNav(active) {
  const userMenu = isLoggedIn() ? `
    <div class="relative" id="user-menu-wrap">
      <button class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-3/50 hover:bg-dark-3 transition" onclick="toggleUserMenu()">
        <div class="avatar-sm avatar">${currentUser.name.charAt(0).toUpperCase()}</div>
        <span class="hide-mobile text-sm font-medium max-w-[80px] truncate">${currentUser.name}</span>
        <i class="fas fa-chevron-down text-[10px] text-slate-400 hide-mobile"></i>
      </button>
      <div class="absolute right-0 top-full mt-2 w-52 glass-strong rounded-xl shadow-2xl overflow-hidden hidden z-50" id="user-dropdown">
        <div class="px-4 py-3 border-b border-dark-3">
          <div class="font-semibold text-sm">${currentUser.name}</div>
          <div class="text-xs text-slate-400 truncate">${currentUser.email}</div>
          ${isPremium() ? '<span class="badge badge-premium text-[10px] mt-1">Premium</span>' : '<span class="badge badge-free text-[10px] mt-1">Free</span>'}
          ${isAdmin() ? ' <span class="badge badge-admin text-[10px] mt-1">Admin</span>' : ''}
        </div>
        <div class="py-1">
          <a href="/profile" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-3/50 hover:text-white transition"><i class="fas fa-user w-5 text-center text-slate-500"></i>Profile</a>
          <a href="/wallet" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-3/50 hover:text-white transition"><i class="fas fa-wallet w-5 text-center text-slate-500"></i>Wallet</a>
          <a href="/settings" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-dark-3/50 hover:text-white transition"><i class="fas fa-gear w-5 text-center text-slate-500"></i>Settings</a>
          ${isAdmin() ? '<a href="/admin" class="flex items-center gap-3 px-4 py-2.5 text-sm text-yellow-400 hover:bg-dark-3/50 transition"><i class="fas fa-shield-halved w-5 text-center"></i>Admin Panel</a>' : ''}
          <button onclick="logout()" class="flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-dark-3/50 w-full text-left transition"><i class="fas fa-sign-out-alt w-5 text-center"></i>Logout</button>
        </div>
      </div>
    </div>` : `
    <div class="flex items-center gap-2">
      <a href="/login" class="btn-ghost text-sm py-2 px-4 rounded-lg">Login</a>
      <a href="/signup" class="btn-primary text-sm py-2 px-4 rounded-lg hide-mobile">Sign Up</a>
    </div>`;

  return `
  <nav class="glass-strong sticky top-0 z-50 animate-slide-down">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex items-center justify-between h-14">
        <a href="/" class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center">
            <i class="fas fa-brain text-white text-xs"></i>
          </div>
          <span class="font-bold text-base gradient-text hide-mobile">WinGo AI</span>
        </a>
        <div class="flex items-center gap-1">
          <a href="/predictions" class="nav-link px-2.5 py-1.5 rounded-lg text-xs font-medium hide-mobile ${active==='predictions'?'active':'text-slate-400 hover:text-white'}">
            <i class="fas fa-bolt mr-1"></i>Predictions
          </a>
          <a href="/history" class="nav-link px-2.5 py-1.5 rounded-lg text-xs font-medium hide-mobile ${active==='history'?'active':'text-slate-400 hover:text-white'}">
            <i class="fas fa-clock-rotate-left mr-1"></i>History
          </a>
          <a href="/statistics" class="nav-link px-2.5 py-1.5 rounded-lg text-xs font-medium hide-mobile ${active==='statistics'?'active':'text-slate-400 hover:text-white'}">
            <i class="fas fa-chart-line mr-1"></i>Stats
          </a>
          <a href="/subscription" class="nav-link px-2.5 py-1.5 rounded-lg text-xs font-medium hide-mobile ${active==='subscription'?'active':'text-slate-400 hover:text-white'}">
            <i class="fas fa-gem mr-1"></i>Premium
          </a>
          <div class="ml-2">${userMenu}</div>
        </div>
      </div>
    </div>
  </nav>
  <!-- Mobile bottom nav -->
  <div class="bottom-nav glass-strong hide-desktop">
    <div class="flex justify-around py-2 px-1">
      <a href="/" class="bottom-nav-item flex flex-col items-center gap-0.5 px-2 py-1 ${active==='landing'?'active':'text-slate-500'}">
        <i class="fas fa-home text-base"></i><span class="text-[9px]">Home</span>
      </a>
      <a href="/predictions" class="bottom-nav-item flex flex-col items-center gap-0.5 px-2 py-1 ${active==='predictions'?'active':'text-slate-500'}">
        <i class="fas fa-bolt text-base"></i><span class="text-[9px]">Predict</span>
      </a>
      <a href="/history" class="bottom-nav-item flex flex-col items-center gap-0.5 px-2 py-1 ${active==='history'?'active':'text-slate-500'}">
        <i class="fas fa-list text-base"></i><span class="text-[9px]">History</span>
      </a>
      <a href="/statistics" class="bottom-nav-item flex flex-col items-center gap-0.5 px-2 py-1 ${active==='statistics'?'active':'text-slate-500'}">
        <i class="fas fa-chart-bar text-base"></i><span class="text-[9px]">Stats</span>
      </a>
      <a href="${isLoggedIn()?'/profile':'/login'}" class="bottom-nav-item flex flex-col items-center gap-0.5 px-2 py-1 ${active==='profile'||active==='login'?'active':'text-slate-500'}">
        <i class="fas fa-${isLoggedIn()?'user':'sign-in-alt'} text-base"></i><span class="text-[9px]">${isLoggedIn()?'Account':'Login'}</span>
      </a>
    </div>
  </div>`;
}

// ===== LANDING PAGE =====
function renderLanding() {
  return `${renderNav('landing')}
  <div class="hero-gradient hero-pattern">
    <div class="max-w-6xl mx-auto px-4 pt-14 pb-16 text-center animate-fade-in-up">
      <div class="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-5 text-xs text-slate-300">
        <span class="w-2 h-2 bg-game-green rounded-full animate-pulse"></span> AI-Powered Predictions Live Now
      </div>
      <h1 class="text-3xl sm:text-5xl font-black mb-5 leading-tight">
        <span class="gradient-text">WinGo AI</span><br>
        <span class="text-white">Prediction Platform</span>
      </h1>
      <p class="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-7">
        Advanced AI-powered predictions for WinGo color trading games with <span class="text-primary-400 font-semibold">65-75% accuracy</span>. Dual AI models, real-time analysis.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center mb-10">
        <a href="/predictions" class="btn-primary text-base px-7 py-3.5 rounded-xl inline-flex items-center gap-2 justify-center">
          <i class="fas fa-rocket"></i> Get Predictions Now
        </a>
        <a href="/subscription" class="btn-outline text-base px-7 py-3.5 rounded-xl inline-flex items-center gap-2 justify-center">
          <i class="fas fa-gem"></i> View Pricing
        </a>
      </div>
      <!-- Live stats -->
      <div class="grid grid-cols-3 gap-3 max-w-md mx-auto">
        <div class="glass rounded-xl p-3"><div class="text-xl font-bold text-primary-400">15,234</div><div class="text-[10px] text-slate-400">Predictions</div></div>
        <div class="glass rounded-xl p-3"><div class="text-xl font-bold text-game-green">68.7%</div><div class="text-[10px] text-slate-400">Accuracy</div></div>
        <div class="glass rounded-xl p-3"><div class="text-xl font-bold text-accent-400">2,156</div><div class="text-[10px] text-slate-400">Users</div></div>
      </div>
    </div>

    <!-- Game Modes -->
    <div class="max-w-4xl mx-auto px-4 pb-14">
      <h2 class="text-2xl font-bold text-center mb-8">Game <span class="gradient-text">Modes</span></h2>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${[
          {id:'30s',name:'30 Sec',icon:'fa-bolt',color:'from-game-red to-red-700'},
          {id:'1min',name:'1 Min',icon:'fa-clock',color:'from-game-green to-emerald-700'},
          {id:'3min',name:'3 Min',icon:'fa-hourglass-half',color:'from-primary-500 to-primary-700'},
          {id:'5min',name:'5 Min',icon:'fa-stopwatch',color:'from-accent-500 to-accent-600'},
        ].map(g => `
          <a href="/predictions" class="glass rounded-xl p-4 text-center hover:border-primary-500/50 transition-all block">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center mx-auto mb-2">
              <i class="fas ${g.icon} text-white text-lg"></i>
            </div>
            <h3 class="font-bold text-sm">WinGo ${g.name}</h3>
          </a>
        `).join('')}
      </div>
    </div>

    <!-- Features -->
    <div class="max-w-5xl mx-auto px-4 pb-14">
      <h2 class="text-2xl font-bold text-center mb-8">Why Choose <span class="gradient-text">WinGo AI</span>?</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${[
          {icon:'fa-robot',title:'Dual AI Models',desc:'Markov Chain + LSTM Neural Network',cl:'text-primary-400'},
          {icon:'fa-bolt',title:'Real-time Updates',desc:'Live predictions with countdown timers',cl:'text-game-green'},
          {icon:'fa-chart-pie',title:'Advanced Analytics',desc:'Statistics, accuracy, performance',cl:'text-accent-400'},
          {icon:'fa-gamepad',title:'4 Game Modes',desc:'30s, 1min, 3min, 5min intervals',cl:'text-game-red'},
          {icon:'fa-shield-halved',title:'Secure & Private',desc:'Your data is encrypted and safe',cl:'text-primary-400'},
          {icon:'fa-mobile-screen',title:'Mobile Optimized',desc:'Beautiful design for all devices',cl:'text-game-green'},
        ].map(f => `
          <div class="glass rounded-xl p-5 animate-fade-in-up hover:border-primary-500/30 transition-all">
            <i class="fas ${f.icon} ${f.cl} text-xl mb-3"></i>
            <h3 class="font-bold text-sm mb-1">${f.title}</h3>
            <p class="text-slate-400 text-xs">${f.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- CTA -->
    <div class="max-w-lg mx-auto px-4 pb-28 text-center">
      <div class="glass rounded-2xl p-8 animate-pulse-glow">
        <h2 class="text-2xl font-bold mb-3">Ready to <span class="gradient-text">Win</span>?</h2>
        <p class="text-slate-400 text-sm mb-6">Join thousands of users with AI predictions.</p>
        <a href="${isLoggedIn()?'/predictions':'/signup'}" class="btn-primary text-base px-8 py-3 rounded-xl inline-flex items-center gap-2">
          <i class="fas fa-${isLoggedIn()?'rocket':'user-plus'}"></i> ${isLoggedIn()?'Start Predicting':'Create Free Account'}
        </a>
      </div>
    </div>

    <footer class="border-t border-dark-3 py-6 pb-20 sm:pb-6">
      <div class="max-w-6xl mx-auto px-4 text-center text-slate-500 text-xs">
        <p>&copy; 2026 WinGo AI Prediction. All rights reserved.</p>
        <div class="flex justify-center gap-4 mt-3">
          <a href="/about" class="hover:text-primary-400 transition">About</a>
          <a href="/subscription" class="hover:text-primary-400 transition">Pricing</a>
        </div>
      </div>
    </footer>
  </div>`;
}

// ===== LOGIN PAGE =====
function renderLogin() {
  return `${renderNav('login')}
  <div class="max-w-md mx-auto px-4 py-16 pb-28 animate-fade-in">
    <div class="glass rounded-2xl p-6">
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-sign-in-alt text-xl text-white"></i>
        </div>
        <h1 class="text-xl font-bold">Welcome Back</h1>
        <p class="text-slate-400 text-sm mt-1">Sign in to your account</p>
      </div>
      <form id="login-form" onsubmit="handleLogin(event)">
        <div class="mb-4">
          <label class="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
          <input type="email" id="login-email" class="input-field" placeholder="your@email.com" required>
        </div>
        <div class="mb-5">
          <label class="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
          <input type="password" id="login-password" class="input-field" placeholder="Enter password" required>
        </div>
        <div id="login-error" class="text-game-red text-xs mb-3 hidden"></div>
        <button type="submit" class="btn-primary w-full py-3 rounded-xl text-sm" id="login-btn">
          <i class="fas fa-sign-in-alt mr-1"></i> Sign In
        </button>
      </form>
      <p class="text-center text-slate-400 text-xs mt-4">
        Don't have an account? <a href="/signup" class="text-primary-400 hover:underline">Sign Up</a>
      </p>
    </div>
  </div>`;
}

// ===== SIGNUP PAGE =====
function renderSignup() {
  return `${renderNav('signup')}
  <div class="max-w-md mx-auto px-4 py-16 pb-28 animate-fade-in">
    <div class="glass rounded-2xl p-6">
      <div class="text-center mb-6">
        <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-user-plus text-xl text-white"></i>
        </div>
        <h1 class="text-xl font-bold">Create Account</h1>
        <p class="text-slate-400 text-sm mt-1">Start getting AI predictions</p>
      </div>
      <form id="signup-form" onsubmit="handleSignup(event)">
        <div class="mb-4">
          <label class="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
          <input type="text" id="signup-name" class="input-field" placeholder="Your full name" required>
        </div>
        <div class="mb-4">
          <label class="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
          <input type="email" id="signup-email" class="input-field" placeholder="your@email.com" required>
        </div>
        <div class="mb-5">
          <label class="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
          <input type="password" id="signup-password" class="input-field" placeholder="Min 6 characters" required minlength="6">
        </div>
        <div id="signup-error" class="text-game-red text-xs mb-3 hidden"></div>
        <button type="submit" class="btn-primary w-full py-3 rounded-xl text-sm" id="signup-btn">
          <i class="fas fa-user-plus mr-1"></i> Create Account
        </button>
      </form>
      <p class="text-center text-slate-400 text-xs mt-4">
        Already have an account? <a href="/login" class="text-primary-400 hover:underline">Sign In</a>
      </p>
    </div>
  </div>`;
}

// ===== PREDICTIONS PAGE =====
function renderPredictions() {
  const locked = !isPremium();
  return `${renderNav('predictions')}
  <div class="max-w-4xl mx-auto px-4 py-5 pb-28 sm:pb-6 animate-fade-in">
    <!-- Game Mode Tabs (video style) -->
    <div class="flex gap-1.5 mb-5 overflow-x-auto pb-1" id="game-tabs">
      ${['30s','1min','3min','5min'].map(g => {
        const labels = {'30s':'Win Go 30s','1min':'Win Go 1Min','3min':'Win Go 3Min','5min':'Win Go 5Min'};
        return `<button class="tab-btn whitespace-nowrap text-xs ${g===state.gameType?'active':''}" data-game="${g}" onclick="selectGame('${g}')">${labels[g]}</button>`;
      }).join('')}
    </div>

    <!-- Timer + Period Info -->
    <div class="glass rounded-xl p-4 mb-5">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Next Period</div>
          <div class="font-mono font-bold text-base text-white" id="next-period">Loading...</div>
          <div class="text-[10px] text-slate-500 mt-0.5" id="training-info">Training data: --</div>
        </div>
        <div class="timer-ring" id="timer-ring">
          <svg width="110" height="110" viewBox="0 0 110 110">
            <defs>
              <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#06b6d4"/>
                <stop offset="100%" style="stop-color:#a855f7"/>
              </linearGradient>
            </defs>
            <circle class="bg" cx="55" cy="55" r="48"/>
            <circle class="progress" cx="55" cy="55" r="48" stroke-dasharray="301.59" stroke-dashoffset="0" id="timer-circle"/>
          </svg>
          <div class="timer-text" id="timer-text">00:00</div>
        </div>
      </div>
    </div>

    ${locked ? `
    <!-- Locked overlay for free users -->
    <div class="relative">
      <div class="glass rounded-xl p-6 mb-5 opacity-30 pointer-events-none">
        <div class="text-center text-slate-500 py-8">
          <i class="fas fa-wand-magic-sparkles text-3xl mb-3"></i>
          <p class="text-sm">AI Prediction Results</p>
        </div>
      </div>
      <div class="lock-overlay rounded-xl">
        <i class="fas fa-lock text-4xl text-primary-400 mb-3"></i>
        <h3 class="font-bold text-lg mb-1">Premium Feature</h3>
        <p class="text-slate-400 text-sm mb-4 text-center px-4">Subscribe to unlock AI predictions</p>
        <a href="/subscription" class="btn-primary text-sm py-2.5 px-6 rounded-xl"><i class="fas fa-gem mr-1"></i> Subscribe Now</a>
        ${!isLoggedIn() ? '<p class="text-xs text-slate-500 mt-3">or <a href="/login" class="text-primary-400 hover:underline">login</a> first</p>' : ''}
      </div>
    </div>
    ` : `
    <!-- Prediction Type + Model -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div>
        <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Type</div>
        <div class="flex gap-1.5" id="type-selector">
          <button class="tab-btn flex-1 text-xs ${state.predictionType==='color'?'active':''}" onclick="selectType('color')"><i class="fas fa-palette mr-1"></i>Color</button>
          <button class="tab-btn flex-1 text-xs ${state.predictionType==='size'?'active':''}" onclick="selectType('size')"><i class="fas fa-arrows-up-down mr-1"></i>Size</button>
        </div>
      </div>
      <div>
        <div class="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">AI Model</div>
        <div class="flex gap-1.5" id="model-selector">
          <button class="tab-btn flex-1 text-xs ${state.modelType==='model_1'?'active':''}" onclick="selectModel('model_1')"><i class="fas fa-link mr-1"></i>Markov</button>
          <button class="tab-btn flex-1 text-xs ${state.modelType==='model_2'?'active':''}" onclick="selectModel('model_2')"><i class="fas fa-brain mr-1"></i>LSTM</button>
        </div>
      </div>
    </div>

    <!-- Prediction Card -->
    <div class="prediction-card glass mb-5" id="prediction-card">
      <div class="header bg-gradient-to-r from-primary-700/20 to-accent-600/20 flex items-center justify-between">
        <span class="font-semibold text-sm"><i class="fas fa-sparkles text-primary-400 mr-1.5"></i>AI Prediction</span>
        <button class="btn-primary text-xs py-2 px-4" onclick="getPrediction()" id="predict-btn">
          <i class="fas fa-wand-magic-sparkles mr-1"></i> Get Prediction
        </button>
      </div>
      <div class="body" id="prediction-body">
        <div class="text-center text-slate-400 py-8">
          <i class="fas fa-wand-magic-sparkles text-3xl mb-3 text-slate-600"></i>
          <p class="text-sm">Click "Get Prediction" to generate</p>
        </div>
      </div>
    </div>
    `}

    <!-- RECENT HISTORY (Prediction Accuracy) -->
    <div class="glass rounded-xl overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-dark-3 flex items-center justify-between">
        <span class="font-semibold text-sm"><i class="fas fa-history text-primary-400 mr-1.5"></i>Recent History</span>
        <span class="text-[10px] text-slate-500">Last 20 Periods</span>
      </div>
      <div id="pred-history-container" class="max-h-[500px] overflow-y-auto">
        <div class="text-center text-slate-500 py-8 text-xs">
          ${locked ? '<i class="fas fa-lock text-lg mb-2 text-slate-600"></i><p>Get a prediction to see history</p>' : '<div class="spinner spinner-sm mx-auto mb-2"></div>Loading...'}
        </div>
      </div>
    </div>

    <!-- Recent Game Results -->
    <div class="glass rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-dark-3 flex items-center justify-between">
        <span class="font-semibold text-sm"><i class="fas fa-clock-rotate-left text-primary-400 mr-1.5"></i>Recent Results</span>
        <a href="/history" class="text-primary-400 text-[10px] hover:underline">View All</a>
      </div>
      <div id="recent-history" class="max-h-80 overflow-y-auto">
        <div class="text-center text-slate-500 py-6 text-xs">Loading results...</div>
      </div>
    </div>
  </div>`;
}

// ===== HISTORY PAGE =====
function renderHistory() {
  return `${renderNav('history')}
  <div class="max-w-4xl mx-auto px-4 py-5 pb-28 sm:pb-6 animate-fade-in">
    <h1 class="text-xl font-bold mb-5"><i class="fas fa-clock-rotate-left text-primary-400 mr-2"></i>Game History</h1>
    <div class="flex gap-1.5 mb-5 overflow-x-auto pb-1">
      ${['1min','30s','3min','5min'].map(g => `
        <button class="tab-btn text-xs ${g==='1min'?'active':''}" onclick="loadHistory('${g}')" data-hist-game="${g}">${g==='30s'?'30 Sec':g==='1min'?'1 Min':g==='3min'?'3 Min':'5 Min'}</button>
      `).join('')}
    </div>
    <div class="glass rounded-xl overflow-hidden">
      <div class="overflow-x-auto" id="history-table">
        <div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>
      </div>
    </div>
  </div>`;
}

// ===== STATISTICS PAGE =====
function renderStatistics() {
  return `${renderNav('statistics')}
  <div class="max-w-4xl mx-auto px-4 py-5 pb-28 sm:pb-6 animate-fade-in">
    <h1 class="text-xl font-bold mb-5"><i class="fas fa-chart-line text-primary-400 mr-2"></i>Statistics</h1>
    <div class="flex gap-1.5 mb-5 overflow-x-auto pb-1">
      ${['1min','30s','3min','5min'].map(g => `
        <button class="tab-btn text-xs ${g==='1min'?'active':''}" onclick="loadStats('${g}')" data-stats-game="${g}">${g==='30s'?'30s':g}</button>
      `).join('')}
    </div>
    <div id="stats-content">
      <div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>
    </div>
  </div>`;
}

// ===== SUBSCRIPTION PAGE =====
function renderSubscription() {
  return `${renderNav('subscription')}
  <div class="max-w-5xl mx-auto px-4 py-6 pb-28 sm:pb-6 animate-fade-in">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold mb-2"><i class="fas fa-gem text-primary-400 mr-2"></i>Premium <span class="gradient-text">Plans</span></h1>
      <p class="text-slate-400 text-sm max-w-md mx-auto">Unlock unlimited AI predictions & advanced analytics</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      ${[
        {id:'weekly',name:'Weekly',price:'180',days:'7 days',badge:'',features:['All game modes','Unlimited predictions','Both AI models','Basic analytics']},
        {id:'monthly',name:'Monthly',price:'499',days:'30 days',badge:'Most Popular',features:['All Weekly features','Advanced analytics','History export','Priority support']},
        {id:'yearly',name:'Yearly',price:'4,999',days:'365 days',badge:'Best Value',features:['All Monthly features','17% savings','Early access','VIP support']},
        {id:'lifetime',name:'Lifetime',price:'19,999',days:'Forever',badge:'Ultimate',features:['All features','Lifetime access','All future updates','Premium forever']},
      ].map(p => `
        <div class="pricing-card glass rounded-xl p-5 flex flex-col ${p.badge==='Most Popular'?'popular':''}">
          ${p.badge ? `<div class="text-[10px] font-bold text-primary-400 uppercase tracking-wider mb-1.5">${p.badge}</div>` : '<div class="mb-1.5">&nbsp;</div>'}
          <h3 class="text-lg font-bold mb-0.5">${p.name}</h3>
          <div class="flex items-baseline gap-1 mb-0.5">
            <span class="text-2xl font-black gradient-text">&#2547;${p.price}</span>
          </div>
          <div class="text-[10px] text-slate-400 mb-3">${p.days}</div>
          <ul class="flex-1 space-y-1.5 mb-4">
            ${p.features.map(f => `<li class="text-xs text-slate-300 flex items-center gap-1.5"><i class="fas fa-check text-game-green text-[10px]"></i>${f}</li>`).join('')}
          </ul>
          <button class="btn-primary w-full py-2.5 rounded-lg text-sm" onclick="showPayment('${p.id}','${p.name}','${p.price}')">
            Select Plan
          </button>
        </div>
      `).join('')}
    </div>

    <!-- Contact -->
    <div class="glass rounded-xl p-5 text-center">
      <h3 class="font-bold text-sm mb-2">Need Help?</h3>
      <p class="text-slate-400 text-xs mb-3">Contact admin for payment verification.</p>
      <div class="flex flex-wrap gap-2 justify-center">
        <a href="https://t.me/emonarafath" target="_blank" class="btn-outline py-2 px-4 rounded-lg text-xs inline-flex items-center gap-1.5"><i class="fab fa-telegram"></i>Telegram</a>
        <a href="https://wa.me/8801756519749" target="_blank" class="btn-outline py-2 px-4 rounded-lg text-xs inline-flex items-center gap-1.5"><i class="fab fa-whatsapp"></i>WhatsApp</a>
      </div>
    </div>
  </div>

  <!-- Payment Modal -->
  <div id="payment-modal" class="modal-overlay hidden" onclick="if(event.target===this)closePayment()">
    <div class="modal-content glass-strong rounded-2xl p-5 animate-fade-in-up" id="payment-modal-content"></div>
  </div>`;
}

// ===== PROFILE PAGE =====
function renderProfile() {
  if (!isLoggedIn()) return renderLogin();
  const u = currentUser;
  return `${renderNav('profile')}
  <div class="max-w-lg mx-auto px-4 py-8 pb-28 animate-fade-in">
    <div class="glass rounded-2xl p-6 mb-5">
      <div class="flex items-center gap-4 mb-5">
        <div class="avatar-lg avatar">${u.name.charAt(0).toUpperCase()}</div>
        <div>
          <h1 class="text-lg font-bold">${u.name}</h1>
          <p class="text-slate-400 text-xs">${u.email}</p>
          <div class="flex gap-1.5 mt-1.5">
            ${isPremium() ? '<span class="badge badge-premium text-[10px]"><i class="fas fa-gem mr-1"></i>Premium</span>' : '<span class="badge badge-free text-[10px]">Free</span>'}
            ${isAdmin() ? '<span class="badge badge-admin text-[10px]"><i class="fas fa-shield mr-1"></i>Admin</span>' : ''}
          </div>
        </div>
      </div>
      ${isPremium() ? `
      <div class="bg-gradient-to-r from-primary-700/20 to-accent-600/20 rounded-xl p-4 mb-4">
        <div class="flex items-center gap-2 mb-1"><i class="fas fa-gem text-primary-400"></i><span class="font-bold text-sm">Subscription Active</span></div>
        <div class="text-xs text-slate-400">Plan: <span class="text-white font-medium">${u.subscription.plan.charAt(0).toUpperCase() + u.subscription.plan.slice(1)}</span></div>
        ${u.subscription.expiresAt ? `<div class="text-xs text-slate-400">Expires: <span class="text-white font-medium">${new Date(u.subscription.expiresAt).toLocaleDateString()}</span></div>` : '<div class="text-xs text-slate-400">Expires: <span class="text-white font-medium">Never</span></div>'}
      </div>` : `
      <div class="bg-dark-1/50 rounded-xl p-4 mb-4 text-center">
        <i class="fas fa-lock text-slate-500 text-xl mb-2"></i>
        <p class="text-sm text-slate-400 mb-2">No active subscription</p>
        <a href="/subscription" class="btn-primary text-xs py-2 px-4 rounded-lg"><i class="fas fa-gem mr-1"></i>Subscribe</a>
      </div>`}
    </div>

    <!-- Quick Links -->
    <div class="glass rounded-2xl overflow-hidden">
      <a href="/predictions" class="flex items-center gap-3 px-5 py-3.5 border-b border-dark-3 hover:bg-dark-3/30 transition">
        <i class="fas fa-bolt text-primary-400 w-5 text-center"></i><span class="text-sm">Predictions</span><i class="fas fa-chevron-right text-slate-600 ml-auto text-xs"></i>
      </a>
      <a href="/wallet" class="flex items-center gap-3 px-5 py-3.5 border-b border-dark-3 hover:bg-dark-3/30 transition">
        <i class="fas fa-wallet text-game-green w-5 text-center"></i><span class="text-sm">Payment History</span><i class="fas fa-chevron-right text-slate-600 ml-auto text-xs"></i>
      </a>
      <a href="/settings" class="flex items-center gap-3 px-5 py-3.5 border-b border-dark-3 hover:bg-dark-3/30 transition">
        <i class="fas fa-gear text-slate-400 w-5 text-center"></i><span class="text-sm">Settings</span><i class="fas fa-chevron-right text-slate-600 ml-auto text-xs"></i>
      </a>
      ${isAdmin() ? '<a href="/admin" class="flex items-center gap-3 px-5 py-3.5 border-b border-dark-3 hover:bg-dark-3/30 transition"><i class="fas fa-shield-halved text-yellow-400 w-5 text-center"></i><span class="text-sm text-yellow-400">Admin Panel</span><i class="fas fa-chevron-right text-slate-600 ml-auto text-xs"></i></a>' : ''}
      <button onclick="logout()" class="flex items-center gap-3 px-5 py-3.5 w-full text-left hover:bg-dark-3/30 transition">
        <i class="fas fa-sign-out-alt text-game-red w-5 text-center"></i><span class="text-sm text-game-red">Logout</span>
      </button>
    </div>
  </div>`;
}

// ===== SETTINGS PAGE =====
function renderSettings() {
  if (!isLoggedIn()) return renderLogin();
  return `${renderNav('settings')}
  <div class="max-w-lg mx-auto px-4 py-8 pb-28 animate-fade-in">
    <h1 class="text-xl font-bold mb-5"><i class="fas fa-gear text-primary-400 mr-2"></i>Settings</h1>
    <div class="glass rounded-2xl p-5 mb-5">
      <h2 class="font-bold text-sm mb-4">Update Profile</h2>
      <form onsubmit="handleUpdateProfile(event)">
        <div class="mb-3">
          <label class="block text-xs text-slate-400 mb-1">Name</label>
          <input type="text" id="settings-name" class="input-field" value="${currentUser.name}" required>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-slate-400 mb-1">New Password (optional)</label>
          <input type="password" id="settings-password" class="input-field" placeholder="Leave blank to keep current">
        </div>
        <button type="submit" class="btn-primary w-full py-2.5 rounded-lg text-sm">Save Changes</button>
      </form>
    </div>
    <div class="glass rounded-2xl p-5">
      <h2 class="font-bold text-sm mb-3">Account Info</h2>
      <div class="space-y-2 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">Email</span><span>${currentUser.email}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Status</span><span>${isPremium() ? '<span class="text-primary-400">Premium</span>' : '<span class="text-slate-500">Free</span>'}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Role</span><span>${isAdmin() ? '<span class="text-yellow-400">Admin</span>' : 'User'}</span></div>
      </div>
    </div>
  </div>`;
}

// ===== WALLET PAGE =====
function renderWallet() {
  if (!isLoggedIn()) return renderLogin();
  return `${renderNav('wallet')}
  <div class="max-w-lg mx-auto px-4 py-8 pb-28 animate-fade-in">
    <h1 class="text-xl font-bold mb-5"><i class="fas fa-wallet text-primary-400 mr-2"></i>Payment History</h1>
    <div id="wallet-content">
      <div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>
    </div>
  </div>`;
}

// ===== ADMIN PAGE =====
function renderAdmin() {
  if (!isLoggedIn() || !isAdmin()) return '';
  return `${renderNav('admin')}
  <div class="max-w-6xl mx-auto px-4 py-5 pb-28 sm:pb-6 animate-fade-in">
    <div class="flex items-center justify-between mb-5">
      <h1 class="text-xl font-bold"><i class="fas fa-shield-halved text-yellow-400 mr-2"></i>Admin Panel</h1>
      <span class="badge badge-admin"><i class="fas fa-key mr-1"></i>Admin</span>
    </div>

    <!-- Stats cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" id="admin-stats">
      <div class="glass rounded-xl p-4"><div class="text-xs text-slate-400 mb-1">Total Users</div><div class="text-xl font-bold" id="as-users">-</div></div>
      <div class="glass rounded-xl p-4"><div class="text-xs text-slate-400 mb-1">Premium</div><div class="text-xl font-bold text-primary-400" id="as-premium">-</div></div>
      <div class="glass rounded-xl p-4"><div class="text-xs text-slate-400 mb-1">Pending</div><div class="text-xl font-bold text-yellow-400" id="as-pending">-</div></div>
      <div class="glass rounded-xl p-4"><div class="text-xs text-slate-400 mb-1">Revenue</div><div class="text-xl font-bold text-game-green" id="as-revenue">-</div></div>
    </div>

    <!-- Day password -->
    <div class="glass rounded-xl p-4 mb-5 flex items-center justify-between">
      <div>
        <div class="text-xs text-slate-400 mb-0.5">Today's Admin Password</div>
        <div class="font-mono font-bold text-primary-400" id="admin-day-password">Loading...</div>
      </div>
      <i class="fas fa-key text-yellow-400"></i>
    </div>

    <!-- Admin tabs -->
    <div class="flex gap-1.5 mb-5 overflow-x-auto pb-1">
      <button class="tab-btn text-xs active" onclick="switchAdminTab('payments')" data-admin-tab="payments"><i class="fas fa-credit-card mr-1"></i>Payments</button>
      <button class="tab-btn text-xs" onclick="switchAdminTab('users')" data-admin-tab="users"><i class="fas fa-users mr-1"></i>Users</button>
    </div>

    <div id="admin-content">
      <div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>
    </div>
  </div>`;
}

// ===== ABOUT PAGE =====
function renderAbout() {
  return `${renderNav('about')}
  <div class="max-w-3xl mx-auto px-4 py-8 pb-28 sm:pb-8 animate-fade-in">
    <h1 class="text-2xl font-bold mb-6 text-center"><span class="gradient-text">About WinGo AI</span></h1>
    <div class="glass rounded-2xl p-6 mb-5">
      <h2 class="text-base font-bold mb-3">Our AI Models</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div class="bg-dark-1/50 rounded-xl p-4">
          <h3 class="font-bold text-primary-400 text-sm mb-1"><i class="fas fa-link mr-1"></i>Markov Chain</h3>
          <p class="text-slate-400 text-xs">Multi-order transition matrices, pattern detection, frequency analysis.</p>
        </div>
        <div class="bg-dark-1/50 rounded-xl p-4">
          <h3 class="font-bold text-accent-400 text-sm mb-1"><i class="fas fa-brain mr-1"></i>LSTM Network</h3>
          <p class="text-slate-400 text-xs">Monte Carlo simulations, momentum analysis, ensemble voting.</p>
        </div>
      </div>
      <h2 class="text-base font-bold mb-3">Game Rules</h2>
      <div class="bg-dark-1/50 rounded-xl p-4">
        <ul class="text-slate-400 text-xs space-y-1.5">
          <li><span class="text-game-green font-bold">Green:</span> Numbers 1, 3, 7, 9</li>
          <li><span class="text-game-red font-bold">Red:</span> Numbers 2, 4, 6, 8</li>
          <li><span class="text-game-violet font-bold">Green+Violet:</span> Number 5</li>
          <li><span class="text-game-violet font-bold">Red+Violet:</span> Number 0</li>
          <li><strong class="text-white">Small:</strong> 0-4 | <strong class="text-white">Big:</strong> 5-9</li>
        </ul>
      </div>
    </div>
  </div>`;
}

// ===== AUTH HANDLERS =====
window.handleLogin = async function(e) {
  e.preventDefault();
  const btn = $('#login-btn');
  const errEl = $('#login-error');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm mx-auto"></div>';
  errEl.classList.add('hidden');

  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  const data = await fetchAPI('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

  if (data.success) {
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('wingo_token', authToken);
    localStorage.setItem('wingo_user', JSON.stringify(currentUser));
    showToast('Welcome back, ' + data.user.name + '!', 'success');
    setTimeout(() => navigate(data.user.isAdmin ? 'admin' : 'predictions'), 500);
  } else {
    errEl.textContent = data.error || 'Login failed';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt mr-1"></i> Sign In';
  }
};

window.handleSignup = async function(e) {
  e.preventDefault();
  const btn = $('#signup-btn');
  const errEl = $('#signup-error');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm mx-auto"></div>';
  errEl.classList.add('hidden');

  const name = $('#signup-name').value.trim();
  const email = $('#signup-email').value.trim();
  const password = $('#signup-password').value;

  const data = await fetchAPI('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });

  if (data.success) {
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('wingo_token', authToken);
    localStorage.setItem('wingo_user', JSON.stringify(currentUser));
    showToast('Account created! Welcome!', 'success');
    setTimeout(() => navigate('predictions'), 500);
  } else {
    errEl.textContent = data.error || 'Signup failed';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus mr-1"></i> Create Account';
  }
};

window.handleUpdateProfile = async function(e) {
  e.preventDefault();
  const name = $('#settings-name').value.trim();
  const password = $('#settings-password').value;
  const body = { name };
  if (password) body.password = password;
  const data = await fetchAPI('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) });
  if (data.success) {
    currentUser.name = name;
    localStorage.setItem('wingo_user', JSON.stringify(currentUser));
    showToast('Profile updated!', 'success');
  } else {
    showToast(data.error || 'Update failed', 'error');
  }
};

window.logout = logout;

window.toggleUserMenu = function() {
  const dd = $('#user-dropdown');
  if (dd) dd.classList.toggle('hidden');
};
document.addEventListener('click', (e) => {
  const wrap = $('#user-menu-wrap');
  const dd = $('#user-dropdown');
  if (dd && wrap && !wrap.contains(e.target)) dd.classList.add('hidden');
});

// ===== PREDICTION LOGIC =====
let countdownInterval;
let autoRefreshInterval;

function initPredictions() {
  startCountdown();
  loadRecentHistory();
  if (isPremium()) loadPredictionHistory();
  autoRefreshInterval = setInterval(() => { loadRecentHistory(); }, 15000);
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    state.countdown = calcCountdown(state.gameType);
    const maxTime = getMaxTime(state.gameType);
    const progress = (state.countdown / maxTime) * 301.59;
    const circle = $('#timer-circle');
    const text = $('#timer-text');
    if (circle) circle.setAttribute('stroke-dashoffset', String(301.59 - progress));
    if (text) text.textContent = formatTime(state.countdown);
    if (state.countdown <= 1) {
      setTimeout(() => { loadRecentHistory(); if (isPremium()) loadPredictionHistory(); }, 3000);
    }
  }, 1000);
}

window.selectGame = function(gameType) {
  state.gameType = gameType;
  state.prediction = null;
  localStorage.setItem('wingo_gameType', gameType);
  $$('#game-tabs .tab-btn').forEach(el => el.classList.toggle('active', el.dataset.game === gameType));
  startCountdown();
  loadRecentHistory();
  if (isPremium()) {
    loadPredictionHistory();
    const body = $('#prediction-body');
    if (body) body.innerHTML = '<div class="text-center text-slate-400 py-8"><i class="fas fa-wand-magic-sparkles text-3xl mb-3 text-slate-600"></i><p class="text-sm">Click "Get Prediction" to generate</p></div>';
  }
};

window.selectType = function(type) {
  state.predictionType = type;
  $$('#type-selector .tab-btn').forEach((el, i) => el.classList.toggle('active', i === (type === 'color' ? 0 : 1)));
  if (state.prediction) renderPredictionResult();
};

window.selectModel = function(model) {
  state.modelType = model;
  state.prediction = null;
  $$('#model-selector .tab-btn').forEach((el, i) => el.classList.toggle('active', i === (model === 'model_1' ? 0 : 1)));
  const body = $('#prediction-body');
  if (body) body.innerHTML = '<div class="text-center text-slate-400 py-8"><i class="fas fa-wand-magic-sparkles text-3xl mb-3 text-slate-600"></i><p class="text-sm">Click "Get Prediction" to generate</p></div>';
};

window.getPrediction = async function() {
  if (!isPremium()) { showToast('Please subscribe first!', 'error'); return; }
  const btn = $('#predict-btn');
  const body = $('#prediction-body');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm mx-auto" style="border-top-color:#fff"></div>';
  body.innerHTML = '<div class="text-center py-8"><div class="spinner mx-auto mb-3"></div><p class="text-slate-400 text-xs">Analyzing patterns...</p></div>';

  const data = await fetchAPI(`/api/predict/${state.gameType}/${state.modelType}`);

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Refresh';

  if (data.success) {
    state.prediction = data;
    state.recentPredictions = data.recentPredictions || [];
    const pe = $('#next-period');
    const ti = $('#training-info');
    if (pe) pe.textContent = data.period;
    if (ti) ti.textContent = `Training data: ${data.prediction.trainingRecords} records`;
    renderPredictionResult();
    renderPredictionHistoryTable(state.recentPredictions);
  } else {
    body.innerHTML = `<div class="text-center py-8 text-game-red"><i class="fas fa-exclamation-triangle text-2xl mb-2"></i><p class="text-sm">${data.error || 'Failed'}</p></div>`;
  }
};

function renderPredictionResult() {
  const p = state.prediction;
  if (!p) return;
  const pred = p.prediction;
  const body = $('#prediction-body');
  if (!body) return;

  if (state.predictionType === 'color') {
    const color = pred.color;
    const cls = getColorClass(color);
    const label = getColorLabel(color);
    body.innerHTML = `
      <div class="animate-fade-in">
        <div class="text-center mb-5">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-full mb-3 glow-${cls.includes('green')?'green':cls==='violet'?'violet':'red'}"
               style="background:${cls.includes('green')?'linear-gradient(135deg,#10B981,#059669)':cls==='violet'?'linear-gradient(135deg,#8B5CF6,#7C3AED)':'linear-gradient(135deg,#EF4444,#DC2626)'}">
            <span class="text-2xl font-black text-white">${label[0]}</span>
          </div>
          <div class="text-xl font-black">${label.toUpperCase()}</div>
          <div class="text-xs text-slate-400 mt-0.5">Confidence: <span class="text-primary-400 font-bold">${pred.colorConfidence.toFixed(1)}%</span></div>
        </div>
        <div class="space-y-2.5 mb-5">
          ${['Green','Red','Violet'].map(c => {
            const key = c.toLowerCase();
            const val = pred.colorProbabilities[key] || 0;
            return `<div class="flex items-center gap-2">
              <span class="w-12 text-[11px] text-slate-400">${c}</span>
              <div class="confidence-bar flex-1"><div class="fill ${key}" style="width:${val.toFixed(1)}%"></div></div>
              <span class="w-10 text-[11px] font-mono text-right">${val.toFixed(1)}%</span>
            </div>`;
          }).join('')}
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <div class="bg-dark-1/50 rounded-lg p-2.5"><span class="text-slate-400">Model</span><br><span class="font-bold">${p.modelName}</span></div>
          <div class="bg-dark-1/50 rounded-lg p-2.5"><span class="text-slate-400">Overall</span><br><span class="font-bold text-primary-400">${pred.overallConfidence.toFixed(1)}%</span></div>
        </div>
        ${pred.patternsDetected && pred.patternsDetected.length ? `
        <div class="mt-3 bg-dark-1/50 rounded-lg p-2.5">
          <span class="text-[10px] text-slate-400 block mb-1.5">Patterns:</span>
          <div class="flex flex-wrap gap-1">${pred.patternsDetected.map(p => `<span class="text-[10px] bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded">${p}</span>`).join('')}</div>
        </div>` : ''}
      </div>`;
  } else {
    const size = pred.size;
    const isBig = size === 'Big';
    body.innerHTML = `
      <div class="animate-fade-in">
        <div class="text-center mb-5">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-full mb-3 ${isBig?'glow-green':'glow-red'}"
               style="background:${isBig?'linear-gradient(135deg,#10B981,#059669)':'linear-gradient(135deg,#EF4444,#DC2626)'}">
            <i class="fas fa-arrow-${isBig?'up':'down'} text-2xl text-white"></i>
          </div>
          <div class="text-xl font-black">${size.toUpperCase()}</div>
          <div class="text-xs text-slate-400 mt-0.5">Confidence: <span class="text-primary-400 font-bold">${pred.sizeConfidence.toFixed(1)}%</span></div>
        </div>
        <div class="space-y-2.5 mb-5">
          ${['Big','Small'].map(s => {
            const key = s.toLowerCase();
            const val = pred.sizeProbabilities[key] || 0;
            return `<div class="flex items-center gap-2">
              <span class="w-12 text-[11px] text-slate-400">${s}</span>
              <div class="confidence-bar flex-1"><div class="fill ${s==='Big'?'green':'red'}" style="width:${val.toFixed(1)}%"></div></div>
              <span class="w-10 text-[11px] font-mono text-right">${val.toFixed(1)}%</span>
            </div>`;
          }).join('')}
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <div class="bg-dark-1/50 rounded-lg p-2.5"><span class="text-slate-400">Model</span><br><span class="font-bold">${p.modelName}</span></div>
          <div class="bg-dark-1/50 rounded-lg p-2.5"><span class="text-slate-400">Overall</span><br><span class="font-bold text-primary-400">${pred.overallConfidence.toFixed(1)}%</span></div>
        </div>
      </div>`;
  }
}

// ===== PREDICTION HISTORY TABLE (RECENT HISTORY - Last 20 Periods) =====
async function loadPredictionHistory() {
  if (!isPremium()) return;
  const container = $('#pred-history-container');
  if (!container) return;
  // Auto-fetch prediction to get history
  const data = await fetchAPI(`/api/predict/${state.gameType}/${state.modelType}`);
  if (data.success && data.recentPredictions) {
    renderPredictionHistoryTable(data.recentPredictions);
  }
}

function renderPredictionHistoryTable(predictions) {
  const container = $('#pred-history-container');
  if (!container) return;

  if (!predictions || predictions.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No prediction data yet</div>';
    return;
  }

  const totalColor = predictions.filter(p => p.colorCorrect !== null).length;
  const correctColor = predictions.filter(p => p.colorCorrect === true).length;
  const accuracy = totalColor > 0 ? ((correctColor / totalColor) * 100).toFixed(1) : '0';

  container.innerHTML = `
    <div class="px-4 py-2 bg-dark-1/30 flex items-center justify-between">
      <span class="text-[10px] text-slate-400">Color Accuracy: <span class="font-bold ${parseFloat(accuracy) >= 50 ? 'text-game-green' : 'text-game-red'}">${accuracy}%</span> (${correctColor}/${totalColor})</span>
    </div>
    <table class="pred-history-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Predicted</th>
          <th>Result</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${predictions.map(p => {
          const predEmoji = getColorEmoji(p.predictedColor);
          const predLabel = getColorLabel(p.predictedColor);
          const resultEmoji = getColorEmoji(p.actualColor);
          const resultLabel = getColorLabel(p.actualColor);
          const isCorrect = p.colorCorrect;
          const statusIcon = isCorrect ? '✅' : '❌';
          const statusText = isCorrect ? 'Correct' : 'Incorrect';
          const statusClass = isCorrect ? 'badge-correct' : 'badge-incorrect';

          return `<tr>
            <td class="font-mono text-slate-400">${p.period.slice(-12)}</td>
            <td>${predEmoji} <span class="text-xs">${predLabel}</span></td>
            <td>${resultEmoji} <span class="text-xs">${resultLabel}</span> <span class="color-ball ${getColorClass(p.actualColor)} text-[10px]" style="width:22px;height:22px">${p.actualNumber}</span></td>
            <td><span class="badge ${statusClass}">${statusIcon} ${statusText}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ===== RECENT GAME RESULTS =====
async function loadRecentHistory() {
  const container = $('#recent-history');
  if (!container) return;
  const data = await fetchAPI(`/api/game-history/${state.gameType}`);
  if (!data.success || !data.results) return;

  const results = data.results.slice(-15).reverse();
  if (results.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-500 py-6 text-xs">No results</div>';
    return;
  }

  container.innerHTML = `
    <table class="w-full text-xs">
      <thead><tr class="text-slate-500 border-b border-dark-3">
        <th class="px-3 py-2 text-left">Period</th>
        <th class="px-2 py-2 text-center">No.</th>
        <th class="px-2 py-2 text-center">Color</th>
        <th class="px-2 py-2 text-center">Size</th>
      </tr></thead>
      <tbody>
        ${results.map(r => {
          const cls = getColorClass(r.color);
          return `<tr class="history-row">
            <td class="px-3 py-2 font-mono text-slate-400 text-[11px]">${r.period.slice(-8)}</td>
            <td class="px-2 py-2 text-center"><span class="color-ball ${cls} text-[11px]" style="width:28px;height:28px">${r.number}</span></td>
            <td class="px-2 py-2 text-center"><span class="font-semibold text-[11px]" style="color:${cls.includes('green')?'#10B981':cls==='violet'?'#8B5CF6':'#EF4444'}">${getColorLabel(r.color)}</span></td>
            <td class="px-2 py-2 text-center"><span class="${r.size==='Big'?'text-game-green':'text-game-red'} font-semibold text-[11px]">${r.size}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ===== HISTORY PAGE LOGIC =====
async function loadHistory(gameType) {
  const gt = gameType || '1min';
  $$('[data-hist-game]').forEach(el => el.classList.toggle('active', el.dataset.histGame === gt));
  const container = $('#history-table');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>';

  const data = await fetchAPI(`/api/game-history/${gt}`);
  if (!data.success || !data.results) {
    container.innerHTML = '<div class="text-center text-slate-500 py-10">Failed to load</div>';
    return;
  }

  const results = data.results.slice().reverse();
  container.innerHTML = `
    <table class="w-full text-xs">
      <thead><tr class="text-slate-500 border-b border-dark-3">
        <th class="px-3 py-2.5 text-left">Period</th>
        <th class="px-2 py-2.5 text-center">No.</th>
        <th class="px-2 py-2.5 text-center">Color</th>
        <th class="px-2 py-2.5 text-center">Size</th>
      </tr></thead>
      <tbody>
        ${results.map(r => {
          const cls = getColorClass(r.color);
          return `<tr class="history-row">
            <td class="px-3 py-2.5 font-mono text-slate-400">${r.period}</td>
            <td class="px-2 py-2.5 text-center"><span class="color-ball ${cls} text-xs" style="width:30px;height:30px">${r.number}</span></td>
            <td class="px-2 py-2.5 text-center"><span class="font-semibold" style="color:${cls.includes('green')?'#10B981':cls==='violet'?'#8B5CF6':'#EF4444'}">${getColorLabel(r.color)}</span></td>
            <td class="px-2 py-2.5 text-center"><span class="${r.size==='Big'?'text-game-green':'text-game-red'} font-semibold">${r.size}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}
window.loadHistory = loadHistory;

// ===== STATISTICS PAGE LOGIC =====
async function loadStats(gameType) {
  const gt = gameType || '1min';
  $$('[data-stats-game]').forEach(el => el.classList.toggle('active', el.dataset.statsGame === gt));
  const container = $('#stats-content');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>';

  const data = await fetchAPI(`/api/stats/${gt}`);
  if (!data.success) {
    container.innerHTML = '<div class="text-center text-slate-500 py-10">Failed</div>';
    return;
  }
  const s = data.stats;
  const greenPct = s.totalRecords > 0 ? ((s.colorDistribution.green / s.totalRecords) * 100).toFixed(1) : '0';
  const redPct = s.totalRecords > 0 ? ((s.colorDistribution.red / s.totalRecords) * 100).toFixed(1) : '0';
  const bigPct = s.totalRecords > 0 ? ((s.sizeDistribution.big / s.totalRecords) * 100).toFixed(1) : '0';
  const smallPct = s.totalRecords > 0 ? ((s.sizeDistribution.small / s.totalRecords) * 100).toFixed(1) : '0';

  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div class="glass rounded-xl p-3"><div class="text-[10px] text-slate-400 mb-0.5">Records</div><div class="text-lg font-bold">${s.totalRecords}</div></div>
        <div class="glass rounded-xl p-3"><div class="text-[10px] text-slate-400 mb-0.5">Color Streak</div><div class="text-lg font-bold ${s.streaks.colorStreakValue==='G'?'text-game-green':'text-game-red'}">${s.streaks.colorStreak}x ${s.streaks.colorStreakValue==='G'?'Green':'Red'}</div></div>
        <div class="glass rounded-xl p-3"><div class="text-[10px] text-slate-400 mb-0.5">Size Streak</div><div class="text-lg font-bold ${s.streaks.sizeStreakValue==='B'?'text-game-green':'text-game-red'}">${s.streaks.sizeStreak}x ${s.streaks.sizeStreakValue==='B'?'Big':'Small'}</div></div>
        <div class="glass rounded-xl p-3"><div class="text-[10px] text-slate-400 mb-0.5">Last</div><div class="text-lg font-bold">${s.lastResult ? `<span class="color-ball ${getColorClass(s.lastResult.color)}" style="width:32px;height:32px;font-size:14px">${s.lastResult.number}</span>` : '-'}</div></div>
      </div>

      <!-- Color Distribution -->
      <div class="glass rounded-xl p-4 mb-4">
        <h3 class="font-bold text-xs mb-3"><i class="fas fa-palette text-primary-400 mr-1.5"></i>Color Distribution</h3>
        <div class="space-y-2">
          <div class="flex items-center gap-2"><span class="w-12 text-xs text-game-green font-semibold">Green</span><div class="confidence-bar flex-1"><div class="fill green" style="width:${greenPct}%"></div></div><span class="w-16 text-xs font-mono text-right">${greenPct}% (${s.colorDistribution.green})</span></div>
          <div class="flex items-center gap-2"><span class="w-12 text-xs text-game-red font-semibold">Red</span><div class="confidence-bar flex-1"><div class="fill red" style="width:${redPct}%"></div></div><span class="w-16 text-xs font-mono text-right">${redPct}% (${s.colorDistribution.red})</span></div>
        </div>
      </div>

      <!-- Size Distribution -->
      <div class="glass rounded-xl p-4 mb-4">
        <h3 class="font-bold text-xs mb-3"><i class="fas fa-arrows-up-down text-primary-400 mr-1.5"></i>Size Distribution</h3>
        <div class="space-y-2">
          <div class="flex items-center gap-2"><span class="w-12 text-xs text-game-green font-semibold">Big</span><div class="confidence-bar flex-1"><div class="fill green" style="width:${bigPct}%"></div></div><span class="w-16 text-xs font-mono text-right">${bigPct}% (${s.sizeDistribution.big})</span></div>
          <div class="flex items-center gap-2"><span class="w-12 text-xs text-game-red font-semibold">Small</span><div class="confidence-bar flex-1"><div class="fill red" style="width:${smallPct}%"></div></div><span class="w-16 text-xs font-mono text-right">${smallPct}% (${s.sizeDistribution.small})</span></div>
        </div>
      </div>

      <!-- Number Frequency -->
      <div class="glass rounded-xl p-4 mb-4">
        <h3 class="font-bold text-xs mb-3"><i class="fas fa-hashtag text-primary-400 mr-1.5"></i>Number Frequency</h3>
        <div class="grid grid-cols-5 gap-2">
          ${[0,1,2,3,4,5,6,7,8,9].map(n => {
            const count = s.numberDistribution[n] || 0;
            const pct = s.totalRecords > 0 ? ((count / s.totalRecords) * 100).toFixed(1) : '0';
            const cls = n === 0 ? 'red-violet' : n === 5 ? 'green-violet' : [1,3,7,9].includes(n) ? 'green' : 'red';
            return `<div class="text-center bg-dark-1/50 rounded-lg p-2"><span class="color-ball ${cls}" style="width:30px;height:30px;font-size:12px">${n}</span><div class="text-[10px] text-slate-400 mt-1">${pct}%</div></div>`;
          }).join('')}
        </div>
      </div>

      <!-- Missing Data Analysis (like video) -->
      ${s.missingData ? `
      <div class="glass rounded-xl p-4 mb-4">
        <h3 class="font-bold text-xs mb-3"><i class="fas fa-table text-primary-400 mr-1.5"></i>Number Analysis (Last 100)</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead><tr class="text-slate-500 border-b border-dark-3">
              <th class="px-2 py-2 text-center">No.</th>
              <th class="px-2 py-2 text-center">Missing</th>
              <th class="px-2 py-2 text-center">Avg Miss</th>
              <th class="px-2 py-2 text-center">Freq</th>
              <th class="px-2 py-2 text-center">Max Con.</th>
            </tr></thead>
            <tbody>
              ${[0,1,2,3,4,5,6,7,8,9].map(n => {
                const d = s.missingData[n] || {};
                const cls = n === 0 ? 'red-violet' : n === 5 ? 'green-violet' : [1,3,7,9].includes(n) ? 'green' : 'red';
                return `<tr class="history-row">
                  <td class="px-2 py-2 text-center"><span class="color-ball ${cls}" style="width:24px;height:24px;font-size:10px">${n}</span></td>
                  <td class="px-2 py-2 text-center font-mono">${d.missing || 0}</td>
                  <td class="px-2 py-2 text-center font-mono">${d.avgMissing || 0}</td>
                  <td class="px-2 py-2 text-center font-mono">${d.frequency || 0}</td>
                  <td class="px-2 py-2 text-center font-mono">${d.maxConsecutive || 0}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Recent Pattern -->
      <div class="glass rounded-xl p-4">
        <h3 class="font-bold text-xs mb-3"><i class="fas fa-wave-square text-primary-400 mr-1.5"></i>Recent Pattern (Last 20)</h3>
        <div class="mb-2">
          <span class="text-[10px] text-slate-400 block mb-1">Colors:</span>
          <div class="flex flex-wrap gap-1">${(s.recentPattern.colors||'').split('').map(c => `<span class="w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold" style="background:${c==='G'?'#10B981':'#EF4444'}">${c}</span>`).join('')}</div>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 block mb-1">Sizes:</span>
          <div class="flex flex-wrap gap-1">${(s.recentPattern.sizes||'').split('').map(s => `<span class="w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold" style="background:${s==='B'?'#10B981':'#EF4444'}">${s}</span>`).join('')}</div>
        </div>
      </div>
    </div>`;
}
window.loadStats = loadStats;

// ===== PAYMENT MODAL =====
window.showPayment = function(planId, planName, price) {
  if (!isLoggedIn()) { navigate('login'); return; }
  const modal = $('#payment-modal');
  const content = $('#payment-modal-content');
  modal.classList.remove('hidden');

  content.innerHTML = `
    <div class="text-center mb-5">
      <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center mx-auto mb-2">
        <i class="fas fa-gem text-xl text-white"></i>
      </div>
      <h2 class="text-lg font-bold">${planName} Plan</h2>
      <div class="text-2xl font-black gradient-text mt-1">&#2547;${price}</div>
    </div>

    <div class="bg-dark-1/50 rounded-xl p-4 mb-4">
      <h3 class="font-bold text-xs mb-2"><i class="fas fa-credit-card text-primary-400 mr-1"></i>Payment Steps</h3>
      <ol class="text-xs text-slate-300 space-y-2">
        <li class="flex gap-2"><span class="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>Send <strong>&#2547;${price}</strong> to <strong class="text-primary-400">01756519749</strong></li>
        <li class="flex gap-2"><span class="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>Via <strong>bKash / Nagad / Rocket</strong></li>
        <li class="flex gap-2"><span class="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>Enter Transaction ID below</li>
      </ol>
    </div>

    <form onsubmit="submitPayment(event, '${planId}', '${price}')">
      <div class="mb-3">
        <label class="text-[10px] text-slate-400 mb-1 block">Transaction ID</label>
        <input type="text" id="pay-txn-id" class="input-field" placeholder="e.g. TXN8A4K2M9" required>
      </div>
      <div class="mb-4">
        <label class="text-[10px] text-slate-400 mb-1 block">Payment Method</label>
        <select id="pay-method" class="input-field" required>
          <option value="bkash">bKash</option>
          <option value="nagad">Nagad</option>
          <option value="rocket">Rocket</option>
        </select>
      </div>
      <button type="submit" class="btn-primary w-full py-2.5 rounded-lg text-sm" id="pay-submit-btn"><i class="fas fa-paper-plane mr-1"></i>Submit Payment</button>
    </form>

    <div class="flex gap-2 mt-3">
      <a href="https://t.me/emonarafath" target="_blank" class="btn-ghost flex-1 py-2 text-xs text-center rounded-lg"><i class="fab fa-telegram mr-1"></i>Telegram</a>
      <a href="https://wa.me/8801756519749" target="_blank" class="btn-ghost flex-1 py-2 text-xs text-center rounded-lg"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</a>
    </div>

    <button onclick="closePayment()" class="btn-ghost w-full py-2 mt-2 rounded-lg text-xs">Cancel</button>`;
};

window.submitPayment = async function(e, planId, price) {
  e.preventDefault();
  const btn = $('#pay-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm mx-auto" style="border-top-color:#fff"></div>';

  const transactionId = $('#pay-txn-id').value.trim();
  const paymentMethod = $('#pay-method').value;

  const data = await fetchAPI('/api/payment/submit', {
    method: 'POST',
    body: JSON.stringify({ plan: planId, transactionId, paymentMethod }),
  });

  if (data.success) {
    closePayment();
    showToast('Payment submitted! Awaiting admin approval.', 'success');
  } else {
    showToast(data.error || 'Payment submission failed', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>Submit Payment';
  }
};

window.closePayment = function() {
  const modal = $('#payment-modal');
  if (modal) modal.classList.add('hidden');
};

// ===== WALLET PAGE LOGIC =====
async function loadPaymentHistory() {
  const container = $('#wallet-content');
  if (!container) return;

  const data = await fetchAPI('/api/payment/history');
  if (!data.success) {
    container.innerHTML = '<div class="text-center text-slate-500 py-10">Failed to load</div>';
    return;
  }

  if (!data.payments || data.payments.length === 0) {
    container.innerHTML = `
      <div class="glass rounded-xl p-6 text-center">
        <i class="fas fa-receipt text-3xl text-slate-600 mb-3"></i>
        <p class="text-slate-400 text-sm mb-3">No payment history</p>
        <a href="/subscription" class="btn-primary text-xs py-2 px-4 rounded-lg"><i class="fas fa-gem mr-1"></i>Subscribe</a>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="space-y-3">
      ${data.payments.reverse().map(p => `
        <div class="glass rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-sm">${p.plan.charAt(0).toUpperCase() + p.plan.slice(1)} Plan</span>
            <span class="badge ${p.status==='approved'?'badge-correct':p.status==='pending'?'badge-pending':'badge-incorrect'}">${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>
          </div>
          <div class="text-xs text-slate-400 space-y-0.5">
            <div>Amount: <span class="text-white">&#2547;${p.amount}</span></div>
            <div>TXN: <span class="text-white font-mono">${p.transactionId}</span></div>
            <div>Method: <span class="text-white">${p.paymentMethod}</span></div>
            <div>Date: <span class="text-white">${new Date(p.createdAt).toLocaleString()}</span></div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ===== ADMIN PAGE LOGIC =====
let adminTab = 'payments';

async function loadAdminData() {
  // Load stats
  const statsData = await fetchAPI('/api/admin/stats');
  if (statsData.success) {
    const s = statsData.stats;
    const el = (id) => document.getElementById(id);
    if (el('as-users')) el('as-users').textContent = s.totalUsers;
    if (el('as-premium')) el('as-premium').textContent = s.premiumUsers;
    if (el('as-pending')) el('as-pending').textContent = s.pendingPayments;
    if (el('as-revenue')) el('as-revenue').textContent = '৳' + s.totalRevenue.toLocaleString();
    if (el('admin-day-password')) el('admin-day-password').textContent = s.dayPassword;
  }
  loadAdminTab();
}

window.switchAdminTab = function(tab) {
  adminTab = tab;
  $$('[data-admin-tab]').forEach(el => el.classList.toggle('active', el.dataset.adminTab === tab));
  loadAdminTab();
};

async function loadAdminTab() {
  const container = $('#admin-content');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-slate-500 py-10"><div class="spinner mx-auto mb-3"></div>Loading...</div>';

  if (adminTab === 'payments') {
    const data = await fetchAPI('/api/admin/payments');
    if (!data.success) { container.innerHTML = '<div class="text-center text-slate-500 py-10">Failed</div>'; return; }
    if (!data.payments || data.payments.length === 0) {
      container.innerHTML = '<div class="glass rounded-xl p-6 text-center text-slate-400 text-sm">No payment requests yet</div>';
      return;
    }
    container.innerHTML = `
      <div class="glass rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="admin-table">
            <thead><tr>
              <th>User</th><th>Plan</th><th>Amount</th><th>TXN ID</th><th>Method</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              ${data.payments.map(p => `<tr>
                <td><div class="text-sm font-medium">${p.userName}</div><div class="text-[10px] text-slate-400">${p.userEmail}</div></td>
                <td class="font-medium">${p.plan}</td>
                <td class="font-mono">৳${p.amount}</td>
                <td class="font-mono text-xs">${p.transactionId}</td>
                <td>${p.paymentMethod}</td>
                <td><span class="badge ${p.status==='approved'?'badge-correct':p.status==='pending'?'badge-pending':'badge-incorrect'}">${p.status}</span></td>
                <td>
                  ${p.status === 'pending' ? `
                    <div class="flex gap-1">
                      <button class="btn-success text-[10px] py-1 px-2 rounded" onclick="adminPaymentAction('${p.id}','approve')"><i class="fas fa-check"></i></button>
                      <button class="btn-danger text-[10px] py-1 px-2 rounded" onclick="adminPaymentAction('${p.id}','reject')"><i class="fas fa-times"></i></button>
                    </div>` : '-'}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } else {
    const data = await fetchAPI('/api/admin/users');
    if (!data.success) { container.innerHTML = '<div class="text-center text-slate-500 py-10">Failed</div>'; return; }
    container.innerHTML = `
      <div class="glass rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="admin-table">
            <thead><tr>
              <th>User</th><th>Status</th><th>Plan</th><th>Expires</th><th>Action</th>
            </tr></thead>
            <tbody>
              ${data.users.map(u => `<tr>
                <td><div class="text-sm font-medium">${u.name}</div><div class="text-[10px] text-slate-400">${u.email}</div></td>
                <td><span class="badge ${u.subscription.active?'badge-premium':'badge-free'}">${u.subscription.active?'Premium':'Free'}</span>${u.isAdmin?' <span class="badge badge-admin">Admin</span>':''}</td>
                <td class="font-medium">${u.subscription.plan}</td>
                <td class="text-xs text-slate-400">${u.subscription.expiresAt ? new Date(u.subscription.expiresAt).toLocaleDateString() : '-'}</td>
                <td>
                  ${!u.isAdmin ? `
                  <div class="flex gap-1">
                    ${!u.subscription.active ? `<button class="btn-success text-[10px] py-1 px-2 rounded" onclick="adminActivate('${u.id}')"><i class="fas fa-check mr-0.5"></i>Activate</button>` : `<button class="btn-danger text-[10px] py-1 px-2 rounded" onclick="adminDeactivate('${u.id}')"><i class="fas fa-ban mr-0.5"></i>Revoke</button>`}
                  </div>` : '<span class="text-xs text-slate-500">-</span>'}
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }
}

window.adminPaymentAction = async function(paymentId, action) {
  const data = await fetchAPI(`/api/admin/payment/${paymentId}/${action}`, { method: 'POST' });
  if (data.success) {
    showToast(`Payment ${action}d!`, 'success');
    loadAdminData();
  } else {
    showToast(data.error || 'Action failed', 'error');
  }
};

window.adminActivate = async function(userId) {
  const data = await fetchAPI('/api/admin/activate', { method: 'POST', body: JSON.stringify({ userId, plan: 'monthly' }) });
  if (data.success) {
    showToast('User activated!', 'success');
    loadAdminTab();
  } else {
    showToast(data.error || 'Failed', 'error');
  }
};

window.adminDeactivate = async function(userId) {
  const data = await fetchAPI('/api/admin/deactivate', { method: 'POST', body: JSON.stringify({ userId }) });
  if (data.success) {
    showToast('Subscription revoked', 'success');
    loadAdminTab();
  } else {
    showToast(data.error || 'Failed', 'error');
  }
};

// ===== INIT =====
render();

// Refresh user data on load
if (isLoggedIn()) refreshUser();

window.addEventListener('beforeunload', () => {
  if (countdownInterval) clearInterval(countdownInterval);
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
});

window.navigate = navigate;

})();
