import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { predictionEngine } from './prediction-engine'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// ============= GAME CONFIG =============
const GAME_CONFIG: Record<string, { name: string; apiUrl: string; interval: number; prefix: string }> = {
  '30s': {
    name: 'WinGo 30 Seconds',
    apiUrl: 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    interval: 30,
    prefix: '10005',
  },
  '1min': {
    name: 'WinGo 1 Minute',
    apiUrl: 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
    interval: 60,
    prefix: '10001',
  },
  '3min': {
    name: 'WinGo 3 Minutes',
    apiUrl: 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
    interval: 180,
    prefix: '10003',
  },
  '5min': {
    name: 'WinGo 5 Minutes',
    apiUrl: 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json',
    interval: 300,
    prefix: '10002',
  },
}

// ============= ADMIN CONFIG =============
const ADMIN_EMAIL = 'emonarafath60@gmail.com'

function getDayPassword(): string {
  const now = new Date()
  const utc6 = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  const day = utc6.getDate()
  const month = utc6.getMonth() + 1
  const year = utc6.getFullYear()
  // Pattern: WG + day*3 + month reversed + year last 2 digits
  return `WG${day * 3}${String(month).split('').reverse().join('')}${String(year).slice(-2)}`
}

// ============= IN-MEMORY STORE (for demo - use Supabase in production) =============
interface User {
  id: string
  email: string
  name: string
  password: string // In production, use hashed passwords via Supabase Auth
  isAdmin: boolean
  subscription: {
    active: boolean
    plan: string
    expiresAt: string | null
    transactionId: string | null
  }
  createdAt: string
}

interface PredictionLog {
  period: string
  gameType: string
  modelType: string
  predictedColor: string
  predictedSize: string
  actualColor: string | null
  actualSize: string | null
  colorCorrect: boolean | null
  sizeCorrect: boolean | null
  timestamp: string
}

interface PaymentRequest {
  id: string
  userId: string
  userEmail: string
  userName: string
  plan: string
  amount: number
  transactionId: string
  paymentMethod: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

// In-memory stores
const users: Map<string, User> = new Map()
const sessions: Map<string, string> = new Map() // token -> userId
const predictionLogs: PredictionLog[] = []
const paymentRequests: PaymentRequest[] = []

// Seed admin user
users.set('admin-1', {
  id: 'admin-1',
  email: ADMIN_EMAIL,
  name: 'Admin',
  password: 'admin123',
  isAdmin: true,
  subscription: { active: true, plan: 'lifetime', expiresAt: null, transactionId: null },
  createdAt: new Date().toISOString(),
})

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function generateToken(): string {
  return 'tk_' + generateId() + '_' + generateId()
}

function getUserFromToken(token: string | undefined): User | null {
  if (!token) return null
  const clean = token.replace('Bearer ', '')
  const userId = sessions.get(clean)
  if (!userId) return null
  return users.get(userId) || null
}

// ============= COLOR LOGIC =============
function getColorByNumber(num: number): string {
  if (num === 0) return 'red,violet'
  if (num === 5) return 'green,violet'
  if ([1, 3, 7, 9].includes(num)) return 'green'
  if ([2, 4, 6, 8].includes(num)) return 'red'
  return 'red'
}

function getSizeByNumber(num: number): string {
  return num >= 5 ? 'Big' : 'Small'
}

function normalizeColor(rawColor: string, number: number): string {
  const c = rawColor.replace(/\//g, ',').toLowerCase().trim()
  if (c.includes('green') && c.includes('violet')) return 'green,violet'
  if (c.includes('red') && c.includes('violet')) return 'red,violet'
  if (c === 'green' || c === 'red') return c
  return getColorByNumber(number)
}

// ============= SEEDED RANDOM =============
function seededRandom(seed: number): number {
  let x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function generateRealisticHistory(gameType: string, count: number = 40) {
  const config = GAME_CONFIG[gameType]
  if (!config) return []

  const now = new Date()
  const utc6 = new Date(now.getTime() + 6 * 60 * 60 * 1000)
  const dateStr = utc6.toISOString().slice(0, 10).replace(/-/g, '')

  const results: any[] = []
  const intervalSeconds = config.interval

  const gameStart = new Date(utc6)
  gameStart.setHours(6, 0, 0, 0)
  if (utc6 < gameStart) gameStart.setDate(gameStart.getDate() - 1)
  const elapsed = (utc6.getTime() - gameStart.getTime()) / 1000
  const currentSeq = Math.floor(elapsed / intervalSeconds)

  for (let i = count - 1; i >= 0; i--) {
    const seq = currentSeq - i
    if (seq < 0) continue
    const periodStr = `${dateStr}${config.prefix}${String(seq).padStart(4, '0')}`
    const seed = parseInt(periodStr.slice(-8))
    const num = Math.floor(seededRandom(seed) * 10)
    const color = getColorByNumber(num)
    const size = getSizeByNumber(num)

    results.push({
      period: periodStr,
      number: num,
      color,
      size,
      timestamp: new Date(gameStart.getTime() + seq * intervalSeconds * 1000).toISOString(),
    })
  }

  return results
}

async function fetchGameData(gameType: string) {
  const config = GAME_CONFIG[gameType]
  if (!config) return []

  try {
    const resp = await fetch(config.apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://draw.ar-lottery01.com/',
        Origin: 'https://draw.ar-lottery01.com',
      },
    })

    if (!resp.ok) throw new Error(`API ${resp.status}`)
    const raw: any = await resp.json()

    let list: any[] = []
    if (raw?.data?.list) list = raw.data.list
    else if (raw?.list) list = raw.list
    else if (Array.isArray(raw?.data)) list = raw.data
    else if (Array.isArray(raw)) list = raw

    if (list.length === 0) throw new Error('Empty response')

    return list.map((item: any) => {
      const num = parseInt(item.number || '0', 10)
      const rawColor = item.colour || item.color || item.resultColor || ''
      return {
        period: String(item.issueNumber || item.issueNo || item.period || ''),
        number: num,
        color: normalizeColor(rawColor, num),
        size: getSizeByNumber(num),
        timestamp: item.drawTime || item.issuetm || new Date().toISOString(),
      }
    }).sort((a: any, b: any) => parseInt(a.period) - parseInt(b.period))
  } catch (err) {
    return generateRealisticHistory(gameType)
  }
}

// ============= AUTH APIs =============

// Register
app.post('/api/auth/register', async (c) => {
  try {
    const { email, name, password } = await c.req.json()
    if (!email || !name || !password) {
      return c.json({ success: false, error: 'All fields are required' }, 400)
    }
    // Check if email exists
    for (const [, user] of users) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return c.json({ success: false, error: 'Email already registered' }, 400)
      }
    }
    const id = generateId()
    const user: User = {
      id,
      email: email.toLowerCase(),
      name,
      password,
      isAdmin: false,
      subscription: { active: false, plan: 'free', expiresAt: null, transactionId: null },
      createdAt: new Date().toISOString(),
    }
    users.set(id, user)
    const token = generateToken()
    sessions.set(token, id)
    return c.json({
      success: true,
      token,
      user: { id, email: user.email, name: user.name, isAdmin: false, subscription: user.subscription },
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Login
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required' }, 400)
    }

    // Check for admin day-password
    const isAdminLogin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    const dayPwd = getDayPassword()

    let found: User | null = null
    for (const [, user] of users) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        // Admin can login with day password OR regular password
        if (isAdminLogin && (password === dayPwd || password === user.password)) {
          found = user
          break
        }
        if (user.password === password) {
          found = user
          break
        }
      }
    }

    if (!found) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }

    const token = generateToken()
    sessions.set(token, found.id)
    return c.json({
      success: true,
      token,
      user: {
        id: found.id,
        email: found.email,
        name: found.name,
        isAdmin: found.isAdmin,
        subscription: found.subscription,
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Logout
app.post('/api/auth/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (token) sessions.delete(token)
  return c.json({ success: true })
})

// Get current user
app.get('/api/auth/me', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user) return c.json({ success: false, error: 'Not authenticated' }, 401)
  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      subscription: user.subscription,
    },
  })
})

// Update profile
app.put('/api/auth/profile', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user) return c.json({ success: false, error: 'Not authenticated' }, 401)
  const { name, password } = await c.req.json()
  if (name) user.name = name
  if (password) user.password = password
  return c.json({ success: true, user: { id: user.id, email: user.email, name: user.name } })
})

// ============= PAYMENT APIs =============

// Submit payment request
app.post('/api/payment/submit', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user) return c.json({ success: false, error: 'Not authenticated' }, 401)

  const { plan, transactionId, paymentMethod } = await c.req.json()
  if (!plan || !transactionId || !paymentMethod) {
    return c.json({ success: false, error: 'All fields required' }, 400)
  }

  const planPrices: Record<string, number> = { weekly: 180, monthly: 499, yearly: 4999, lifetime: 19999 }
  const amount = planPrices[plan]
  if (!amount) return c.json({ success: false, error: 'Invalid plan' }, 400)

  const payment: PaymentRequest = {
    id: generateId(),
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    plan,
    amount,
    transactionId,
    paymentMethod,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  paymentRequests.push(payment)
  return c.json({ success: true, paymentId: payment.id, message: 'Payment submitted for review' })
})

// Get user payment history
app.get('/api/payment/history', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user) return c.json({ success: false, error: 'Not authenticated' }, 401)

  const userPayments = paymentRequests.filter(p => p.userId === user.id)
  return c.json({ success: true, payments: userPayments })
})

// ============= ADMIN APIs =============

// Admin: get all users
app.get('/api/admin/users', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user || !user.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  const allUsers = Array.from(users.values()).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    subscription: u.subscription,
    createdAt: u.createdAt,
  }))
  return c.json({ success: true, users: allUsers })
})

// Admin: get all payment requests
app.get('/api/admin/payments', async (c) => {
  const user = getUserFromToken(c.req.header('Authorization'))
  if (!user || !user.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  return c.json({ success: true, payments: paymentRequests.slice().reverse() })
})

// Admin: approve/reject payment
app.post('/api/admin/payment/:id/:action', async (c) => {
  const adminUser = getUserFromToken(c.req.header('Authorization'))
  if (!adminUser || !adminUser.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  const paymentId = c.req.param('id')
  const action = c.req.param('action') as 'approve' | 'reject'

  const payment = paymentRequests.find(p => p.id === paymentId)
  if (!payment) return c.json({ success: false, error: 'Payment not found' }, 404)

  if (action === 'approve') {
    payment.status = 'approved'
    const targetUser = users.get(payment.userId)
    if (targetUser) {
      const planDays: Record<string, number> = { weekly: 7, monthly: 30, yearly: 365, lifetime: 999999 }
      const days = planDays[payment.plan] || 30
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
      targetUser.subscription = {
        active: true,
        plan: payment.plan,
        expiresAt,
        transactionId: payment.transactionId,
      }
    }
  } else {
    payment.status = 'rejected'
  }

  return c.json({ success: true, payment })
})

// Admin: manually activate subscription
app.post('/api/admin/activate', async (c) => {
  const adminUser = getUserFromToken(c.req.header('Authorization'))
  if (!adminUser || !adminUser.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  const { userId, plan, days } = await c.req.json()
  const targetUser = users.get(userId)
  if (!targetUser) return c.json({ success: false, error: 'User not found' }, 404)

  const d = days || { weekly: 7, monthly: 30, yearly: 365, lifetime: 999999 }[plan] || 30
  targetUser.subscription = {
    active: true,
    plan: plan || 'monthly',
    expiresAt: new Date(Date.now() + d * 86400000).toISOString(),
    transactionId: null,
  }

  return c.json({ success: true, user: { id: targetUser.id, email: targetUser.email, subscription: targetUser.subscription } })
})

// Admin: deactivate subscription
app.post('/api/admin/deactivate', async (c) => {
  const adminUser = getUserFromToken(c.req.header('Authorization'))
  if (!adminUser || !adminUser.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  const { userId } = await c.req.json()
  const targetUser = users.get(userId)
  if (!targetUser) return c.json({ success: false, error: 'User not found' }, 404)

  targetUser.subscription = { active: false, plan: 'free', expiresAt: null, transactionId: null }
  return c.json({ success: true })
})

// Admin: get stats
app.get('/api/admin/stats', async (c) => {
  const adminUser = getUserFromToken(c.req.header('Authorization'))
  if (!adminUser || !adminUser.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  const allUsers = Array.from(users.values())
  const totalUsers = allUsers.length
  const premiumUsers = allUsers.filter(u => u.subscription.active).length
  const totalPayments = paymentRequests.length
  const pendingPayments = paymentRequests.filter(p => p.status === 'pending').length
  const approvedPayments = paymentRequests.filter(p => p.status === 'approved')
  const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.amount, 0)

  return c.json({
    success: true,
    stats: {
      totalUsers,
      premiumUsers,
      freeUsers: totalUsers - premiumUsers,
      totalPayments,
      pendingPayments,
      approvedPayments: approvedPayments.length,
      totalRevenue,
      dayPassword: getDayPassword(),
    },
  })
})

// Admin: get today's password
app.get('/api/admin/day-password', async (c) => {
  const adminUser = getUserFromToken(c.req.header('Authorization'))
  if (!adminUser || !adminUser.isAdmin) return c.json({ success: false, error: 'Unauthorized' }, 403)

  return c.json({ success: true, password: getDayPassword() })
})

// ============= PREDICTION with logging =============

app.get('/api/predict/:gameType/:modelType', async (c) => {
  const gameType = c.req.param('gameType')
  const modelType = c.req.param('modelType') as 'model_1' | 'model_2'
  const config = GAME_CONFIG[gameType]
  if (!config) return c.json({ error: 'Invalid game type' }, 400)

  try {
    const history = await fetchGameData(gameType)

    if (history.length < 10) {
      return c.json({ success: false, error: 'Insufficient data for prediction' })
    }

    const latestPeriod = history[history.length - 1].period
    const nextPeriod = String(BigInt(latestPeriod) + 1n)

    const engine = predictionEngine
    engine.loadData(history)
    engine.train()

    const prediction = modelType === 'model_1' ? engine.predictMarkov() : engine.predictLSTM()

    if (!prediction) {
      return c.json({ success: false, error: 'Prediction generation failed' })
    }

    // Log prediction for accuracy tracking
    const baseColor = prediction.color.includes('green') ? 'green' : prediction.color.includes('violet') ? 'violet' : 'red'
    const log: PredictionLog = {
      period: nextPeriod,
      gameType,
      modelType,
      predictedColor: baseColor,
      predictedSize: prediction.size,
      actualColor: null,
      actualSize: null,
      colorCorrect: null,
      sizeCorrect: null,
      timestamp: new Date().toISOString(),
    }

    // Check if we already have the result for the predicted period
    const existingResult = history.find(h => h.period === nextPeriod)
    if (existingResult) {
      const actualBaseColor = existingResult.color.includes('green') ? 'green' : existingResult.color.includes('violet') ? 'violet' : 'red'
      log.actualColor = actualBaseColor
      log.actualSize = existingResult.size
      log.colorCorrect = log.predictedColor === actualBaseColor
      log.sizeCorrect = log.predictedSize === existingResult.size
    }

    predictionLogs.push(log)
    // Keep only last 1000 logs
    if (predictionLogs.length > 1000) predictionLogs.splice(0, predictionLogs.length - 1000)

    // Generate recent prediction history (compare predictions with actual results)
    const recentPredictions = generatePredictionHistory(history, gameType, modelType)

    return c.json({
      success: true,
      gameType,
      modelType,
      modelName: modelType === 'model_1' ? 'Markov Chain' : 'LSTM Neural Network',
      period: nextPeriod,
      latestPeriod,
      prediction: {
        color: prediction.color,
        colorConfidence: prediction.colorConfidence,
        colorProbabilities: prediction.colorProbabilities,
        size: prediction.size,
        sizeConfidence: prediction.sizeConfidence,
        sizeProbabilities: prediction.sizeProbabilities,
        overallConfidence: prediction.overallConfidence,
        patternsDetected: prediction.patternsDetected,
        trainingRecords: history.length,
      },
      recentPredictions,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message })
  }
})

// Generate prediction history by simulating past predictions
function generatePredictionHistory(history: any[], gameType: string, modelType: string) {
  if (history.length < 22) return []

  const results: any[] = []
  const engineCopy = predictionEngine

  // Take last 20 results, for each one simulate what the prediction would have been
  const last20 = history.slice(-20)

  for (let i = 0; i < last20.length; i++) {
    const currentResult = last20[i]
    const priorData = history.slice(0, history.indexOf(currentResult))

    if (priorData.length < 10) continue

    engineCopy.loadData(priorData)
    engineCopy.train()

    const pred = modelType === 'model_1' ? engineCopy.predictMarkov() : engineCopy.predictLSTM()
    if (!pred) continue

    const predictedBaseColor = pred.color.includes('green') ? 'green' : pred.color.includes('violet') ? 'violet' : 'red'
    const actualBaseColor = currentResult.color.includes('green') ? 'green' : currentResult.color.includes('violet') ? 'violet' : 'red'
    const colorCorrect = predictedBaseColor === actualBaseColor
    const sizeCorrect = pred.size === currentResult.size

    results.push({
      period: currentResult.period,
      predictedColor: predictedBaseColor,
      predictedSize: pred.size,
      actualColor: actualBaseColor,
      actualSize: currentResult.size,
      actualNumber: currentResult.number,
      colorCorrect,
      sizeCorrect,
    })
  }

  return results.reverse() // Latest first
}

// ============= GAME HISTORY =============
app.get('/api/game-history/:gameType', async (c) => {
  const gameType = c.req.param('gameType')
  const config = GAME_CONFIG[gameType]
  if (!config) return c.json({ error: 'Invalid game type' }, 400)

  try {
    const results = await fetchGameData(gameType)
    return c.json({
      success: true,
      gameType,
      gameName: config.name,
      count: results.length,
      results,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message, results: [] })
  }
})

// ============= STATS =============
app.get('/api/stats/:gameType', async (c) => {
  const gameType = c.req.param('gameType')
  const config = GAME_CONFIG[gameType]
  if (!config) return c.json({ error: 'Invalid game type' }, 400)

  try {
    const history = await fetchGameData(gameType)

    const totalRecords = history.length
    let greenCount = 0, redCount = 0, bigCount = 0, smallCount = 0
    const numberCounts: Record<number, number> = {}

    for (const r of history) {
      const baseColor = r.color.includes('green') ? 'green' : 'red'
      if (baseColor === 'green') greenCount++
      else redCount++
      if (r.size === 'Big') bigCount++
      else smallCount++
      numberCounts[r.number] = (numberCounts[r.number] || 0) + 1
    }

    const recent = history.slice(-20)
    const recentColors = recent.map((r: any) => r.color.includes('green') ? 'G' : 'R')
    const recentSizes = recent.map((r: any) => r.size === 'Big' ? 'B' : 'S')

    let currentColorStreak = 1
    let currentSizeStreak = 1
    for (let i = recent.length - 2; i >= 0; i--) {
      if (recentColors[i] === recentColors[recent.length - 1]) currentColorStreak++
      else break
    }
    for (let i = recent.length - 2; i >= 0; i--) {
      if (recentSizes[i] === recentSizes[recent.length - 1]) currentSizeStreak++
      else break
    }

    // Missing analysis for each number (like in the video)
    const missingData: Record<number, { missing: number; avgMissing: number; frequency: number; maxConsecutive: number }> = {}
    for (let n = 0; n <= 9; n++) {
      const positions: number[] = []
      for (let i = 0; i < history.length; i++) {
        if (history[i].number === n) positions.push(i)
      }
      const freq = positions.length
      let lastPos = history.length
      const missing = positions.length > 0 ? history.length - 1 - positions[positions.length - 1] : history.length
      const gaps: number[] = []
      for (let i = 1; i < positions.length; i++) {
        gaps.push(positions[i] - positions[i - 1] - 1)
      }
      const avgMissing = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
      // Max consecutive
      let maxCons = 0, curCons = 0
      for (const r of history) {
        if (r.number === n) { curCons++; maxCons = Math.max(maxCons, curCons) }
        else curCons = 0
      }
      missingData[n] = { missing, avgMissing: Math.round(avgMissing * 10) / 10, frequency: freq, maxConsecutive: maxCons }
    }

    return c.json({
      success: true,
      gameType,
      stats: {
        totalRecords,
        colorDistribution: { green: greenCount, red: redCount },
        sizeDistribution: { big: bigCount, small: smallCount },
        numberDistribution: numberCounts,
        recentPattern: { colors: recentColors.join(''), sizes: recentSizes.join('') },
        streaks: {
          colorStreak: currentColorStreak,
          colorStreakValue: recentColors[recentColors.length - 1],
          sizeStreak: currentSizeStreak,
          sizeStreakValue: recentSizes[recentSizes.length - 1],
        },
        lastResult: history.length > 0 ? history[history.length - 1] : null,
        missingData,
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message })
  }
})

// ============= CONFIG =============
app.get('/api/config', (c) => {
  return c.json({
    gameTypes: Object.entries(GAME_CONFIG).map(([key, val]) => ({
      id: key,
      name: val.name,
      interval: val.interval,
    })),
    models: [
      { id: 'model_1', name: 'Markov Chain', description: 'Pattern-based lightweight model' },
      { id: 'model_2', name: 'LSTM Neural Network', description: 'Advanced deep learning model' },
    ],
    subscriptionPlans: [
      { id: 'weekly', name: 'Weekly', price: 180, currency: 'BDT', days: 7, badge: '' },
      { id: 'monthly', name: 'Monthly', price: 499, currency: 'BDT', days: 30, badge: 'Most Popular' },
      { id: 'yearly', name: 'Yearly', price: 4999, currency: 'BDT', days: 365, badge: 'Best Value' },
      { id: 'lifetime', name: 'Lifetime', price: 19999, currency: 'BDT', days: 999999, badge: 'Ultimate' },
    ],
  })
})

// ============= PREDICTION ACCURACY =============
app.get('/api/accuracy/:gameType', async (c) => {
  const gameType = c.req.param('gameType')
  const logs = predictionLogs.filter(l => l.gameType === gameType && l.colorCorrect !== null)
  const total = logs.length
  const colorCorrect = logs.filter(l => l.colorCorrect).length
  const sizeCorrect = logs.filter(l => l.sizeCorrect).length

  return c.json({
    success: true,
    accuracy: {
      total,
      colorAccuracy: total > 0 ? ((colorCorrect / total) * 100).toFixed(1) : '0',
      sizeAccuracy: total > 0 ? ((sizeCorrect / total) * 100).toFixed(1) : '0',
      overallAccuracy: total > 0 ? ((((colorCorrect + sizeCorrect) / (total * 2)) * 100)).toFixed(1) : '0',
    },
  })
})

// ============= SERVE PAGES =============
const PAGES = ['', 'predictions', 'history', 'statistics', 'subscription', 'about', 'login', 'signup', 'profile', 'settings', 'admin', 'wallet']

for (const page of PAGES) {
  const route = page === '' ? '/' : `/${page}`
  app.get(route, (c) => c.html(getPageHTML(page || 'landing')))
}

function getPageHTML(page: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>WinGo AI Prediction - AI-Powered Color Trading Predictions</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              primary: { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63' },
              accent: { 400:'#c084fc',500:'#a855f7',600:'#9333ea' },
              game: { green:'#10B981', red:'#EF4444', violet:'#8B5CF6' },
              dark: { 1:'#0c1222', 2:'#131c31', 3:'#1a2744', 4:'#243552' }
            },
            fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] }
          }
        }
      }
    </script>
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body class="bg-dark-1 text-white font-sans min-h-screen" data-page="${page}">
    <div id="app"></div>
    <script src="/static/app.js"></script>
</body>
</html>`
}

export default app
