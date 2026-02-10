// ============= WINGO AI PREDICTION ENGINE =============
// Ported from Python bot: Markov Chain + LSTM-like ensemble

interface GameRecord {
  period: string
  number: number
  color: string
  size: string
}

interface PredictionResult {
  color: string
  colorConfidence: number
  colorProbabilities: { green: number; red: number; violet: number }
  size: string
  sizeConfidence: number
  sizeProbabilities: { big: number; small: number }
  overallConfidence: number
  patternsDetected: string[]
}

type TransitionMap = Record<string, Record<string, number>>

class PredictionEngine {
  private history: GameRecord[] = []
  private colorMarkov1: TransitionMap = {}
  private colorMarkov2: TransitionMap = {}
  private colorMarkov3: TransitionMap = {}
  private sizeMarkov1: TransitionMap = {}
  private sizeMarkov2: TransitionMap = {}
  private sizeMarkov3: TransitionMap = {}
  private colorFrequency: Record<string, number> = {}
  private sizeFrequency: Record<string, number> = {}
  private numberTrends: any = {}
  private patternsDetected: string[] = []

  loadData(data: GameRecord[]) {
    // Sort chronologically (oldest first)
    this.history = [...data].sort((a, b) => {
      const pa = parseInt(a.period) || 0
      const pb = parseInt(b.period) || 0
      return pa - pb
    })
  }

  train() {
    if (this.history.length < 10) return

    const colors = this.history.map(r => this.normalizeBaseColor(r.color))
    const sizes = this.history.map(r => r.size)
    const numbers = this.history.map(r => r.number)

    // Train Markov chains of different orders
    this.colorMarkov1 = this.trainMarkov(colors, 1)
    this.sizeMarkov1 = this.trainMarkov(sizes, 1)

    if (this.history.length >= 20) {
      this.colorMarkov2 = this.trainMarkov(colors, 2)
      this.sizeMarkov2 = this.trainMarkov(sizes, 2)
    }

    if (this.history.length >= 50) {
      this.colorMarkov3 = this.trainMarkov(colors, 3)
      this.sizeMarkov3 = this.trainMarkov(sizes, 3)
    }

    // Frequency analysis
    this.colorFrequency = this.calcFrequency(colors)
    this.sizeFrequency = this.calcFrequency(sizes)

    // Number trends
    this.numberTrends = this.analyzeNumberTrends(numbers)

    // Pattern detection
    this.patternsDetected = this.detectPatterns(colors, sizes)
  }

  predictMarkov(): PredictionResult | null {
    if (this.history.length < 10) return null

    const colors = this.history.map(r => this.normalizeBaseColor(r.color))
    const sizes = this.history.map(r => r.size)

    // Color prediction using ensemble of Markov models
    const colorVotes: Record<string, number> = {}
    const colorConfidences: Record<string, number[]> = {}

    // Order 1
    const m1Color = this.markovPredict(this.colorMarkov1, colors, 1)
    if (m1Color) {
      colorVotes[m1Color.prediction] = (colorVotes[m1Color.prediction] || 0) + 1.0
      if (!colorConfidences[m1Color.prediction]) colorConfidences[m1Color.prediction] = []
      colorConfidences[m1Color.prediction].push(m1Color.confidence)
    }

    // Order 2
    if (Object.keys(this.colorMarkov2).length > 0) {
      const m2Color = this.markovPredict(this.colorMarkov2, colors, 2)
      if (m2Color) {
        colorVotes[m2Color.prediction] = (colorVotes[m2Color.prediction] || 0) + 1.2
        if (!colorConfidences[m2Color.prediction]) colorConfidences[m2Color.prediction] = []
        colorConfidences[m2Color.prediction].push(m2Color.confidence)
      }
    }

    // Order 3
    if (Object.keys(this.colorMarkov3).length > 0) {
      const m3Color = this.markovPredict(this.colorMarkov3, colors, 3)
      if (m3Color) {
        colorVotes[m3Color.prediction] = (colorVotes[m3Color.prediction] || 0) + 1.5
        if (!colorConfidences[m3Color.prediction]) colorConfidences[m3Color.prediction] = []
        colorConfidences[m3Color.prediction].push(m3Color.confidence)
      }
    }

    // Frequency fallback
    const freqColor = this.maxKey(this.colorFrequency)
    if (freqColor) {
      colorVotes[freqColor] = (colorVotes[freqColor] || 0) + 0.8
      if (!colorConfidences[freqColor]) colorConfidences[freqColor] = []
      colorConfidences[freqColor].push(this.colorFrequency[freqColor] * 100)
    }

    // Pattern-based prediction
    const patternColor = this.patternPredict(colors)
    if (patternColor) {
      colorVotes[patternColor.prediction] = (colorVotes[patternColor.prediction] || 0) + 1.3
      if (!colorConfidences[patternColor.prediction]) colorConfidences[patternColor.prediction] = []
      colorConfidences[patternColor.prediction].push(patternColor.confidence)
    }

    // Size prediction
    const sizeVotes: Record<string, number> = {}
    const sizeConfidences: Record<string, number[]> = {}

    const m1Size = this.markovPredict(this.sizeMarkov1, sizes, 1)
    if (m1Size) {
      sizeVotes[m1Size.prediction] = (sizeVotes[m1Size.prediction] || 0) + 1.0
      if (!sizeConfidences[m1Size.prediction]) sizeConfidences[m1Size.prediction] = []
      sizeConfidences[m1Size.prediction].push(m1Size.confidence)
    }

    if (Object.keys(this.sizeMarkov2).length > 0) {
      const m2Size = this.markovPredict(this.sizeMarkov2, sizes, 2)
      if (m2Size) {
        sizeVotes[m2Size.prediction] = (sizeVotes[m2Size.prediction] || 0) + 1.2
        if (!sizeConfidences[m2Size.prediction]) sizeConfidences[m2Size.prediction] = []
        sizeConfidences[m2Size.prediction].push(m2Size.confidence)
      }
    }

    if (Object.keys(this.sizeMarkov3).length > 0) {
      const m3Size = this.markovPredict(this.sizeMarkov3, sizes, 3)
      if (m3Size) {
        sizeVotes[m3Size.prediction] = (sizeVotes[m3Size.prediction] || 0) + 1.5
        if (!sizeConfidences[m3Size.prediction]) sizeConfidences[m3Size.prediction] = []
        sizeConfidences[m3Size.prediction].push(m3Size.confidence)
      }
    }

    // Trend for size
    if (this.numberTrends.bigProbability !== undefined) {
      const trendSize = this.numberTrends.bigProbability > 0.5 ? 'Big' : 'Small'
      const trendConf = Math.max(this.numberTrends.bigProbability, this.numberTrends.smallProbability) * 100
      sizeVotes[trendSize] = (sizeVotes[trendSize] || 0) + 1.0
      if (!sizeConfidences[trendSize]) sizeConfidences[trendSize] = []
      sizeConfidences[trendSize].push(trendConf)
    }

    // Finalize
    const finalColor = this.maxKey(colorVotes) || 'green'
    const finalSize = this.maxKey(sizeVotes) || 'Big'

    const colorConf = this.avgConfidence(colorConfidences[finalColor] || [65])
    const sizeConf = this.avgConfidence(sizeConfidences[finalSize] || [60])

    const totalColorVotes = Object.values(colorVotes).reduce((a, b) => a + b, 0)
    const totalSizeVotes = Object.values(sizeVotes).reduce((a, b) => a + b, 0)

    return {
      color: finalColor,
      colorConfidence: Math.min(85, Math.max(55, colorConf + this.jitter(3))),
      colorProbabilities: {
        green: totalColorVotes > 0 ? ((colorVotes['green'] || 0) / totalColorVotes) * 100 : 33,
        red: totalColorVotes > 0 ? ((colorVotes['red'] || 0) / totalColorVotes) * 100 : 33,
        violet: totalColorVotes > 0 ? ((colorVotes['violet'] || 0) / totalColorVotes) * 100 : 10,
      },
      size: finalSize,
      sizeConfidence: Math.min(82, Math.max(52, sizeConf + this.jitter(3))),
      sizeProbabilities: {
        big: totalSizeVotes > 0 ? ((sizeVotes['Big'] || 0) / totalSizeVotes) * 100 : 50,
        small: totalSizeVotes > 0 ? ((sizeVotes['Small'] || 0) / totalSizeVotes) * 100 : 50,
      },
      overallConfidence: Math.min(80, Math.max(55, (colorConf + sizeConf) / 2 + this.jitter(2))),
      patternsDetected: this.patternsDetected,
    }
  }

  predictLSTM(): PredictionResult | null {
    // LSTM-like: uses deeper patterns, Monte Carlo simulation, and weighted ensemble
    if (this.history.length < 10) return null

    const colors = this.history.map(r => this.normalizeBaseColor(r.color))
    const sizes = this.history.map(r => r.size)
    const numbers = this.history.map(r => r.number)

    // Monte Carlo simulation for color
    const mcColor = this.monteCarloSim(colors, 500)
    const mcSize = this.monteCarloSim(sizes, 500)

    // Weighted combination with Markov
    const colorVotes: Record<string, number> = {}
    const sizeVotes: Record<string, number> = {}

    // Monte Carlo (high weight for LSTM)
    for (const [val, prob] of Object.entries(mcColor)) {
      colorVotes[val] = (colorVotes[val] || 0) + prob * 2.0
    }
    for (const [val, prob] of Object.entries(mcSize)) {
      sizeVotes[val] = (sizeVotes[val] || 0) + prob * 2.0
    }

    // Higher-order Markov
    if (Object.keys(this.colorMarkov3).length > 0) {
      const m3 = this.markovPredict(this.colorMarkov3, colors, 3)
      if (m3) colorVotes[m3.prediction] = (colorVotes[m3.prediction] || 0) + 1.8
    }
    if (Object.keys(this.colorMarkov2).length > 0) {
      const m2 = this.markovPredict(this.colorMarkov2, colors, 2)
      if (m2) colorVotes[m2.prediction] = (colorVotes[m2.prediction] || 0) + 1.5
    }

    if (Object.keys(this.sizeMarkov3).length > 0) {
      const m3s = this.markovPredict(this.sizeMarkov3, sizes, 3)
      if (m3s) sizeVotes[m3s.prediction] = (sizeVotes[m3s.prediction] || 0) + 1.8
    }
    if (Object.keys(this.sizeMarkov2).length > 0) {
      const m2s = this.markovPredict(this.sizeMarkov2, sizes, 2)
      if (m2s) sizeVotes[m2s.prediction] = (sizeVotes[m2s.prediction] || 0) + 1.5
    }

    // Momentum analysis
    const colorMomentum = this.calcMomentum(colors)
    const sizeMomentum = this.calcMomentum(sizes)

    // If hot streak detected, boost current trend
    if (colorMomentum < 0.3) {
      const lastColor = colors[colors.length - 1]
      colorVotes[lastColor] = (colorVotes[lastColor] || 0) + 1.2
    }
    if (sizeMomentum < 0.3) {
      const lastSize = sizes[sizes.length - 1]
      sizeVotes[lastSize] = (sizeVotes[lastSize] || 0) + 1.2
    }

    // Number-based size prediction
    const avgNumber = numbers.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, numbers.length)
    if (avgNumber >= 5) {
      sizeVotes['Big'] = (sizeVotes['Big'] || 0) + 0.8
    } else {
      sizeVotes['Small'] = (sizeVotes['Small'] || 0) + 0.8
    }

    const finalColor = this.maxKey(colorVotes) || 'green'
    const finalSize = this.maxKey(sizeVotes) || 'Big'

    const totalColorVotes = Object.values(colorVotes).reduce((a, b) => a + b, 0)
    const totalSizeVotes = Object.values(sizeVotes).reduce((a, b) => a + b, 0)

    const colorConf = totalColorVotes > 0 ? ((colorVotes[finalColor] || 0) / totalColorVotes) * 100 : 50
    const sizeConf = totalSizeVotes > 0 ? ((sizeVotes[finalSize] || 0) / totalSizeVotes) * 100 : 50

    return {
      color: finalColor,
      colorConfidence: Math.min(88, Math.max(58, colorConf + this.jitter(4))),
      colorProbabilities: {
        green: totalColorVotes > 0 ? ((colorVotes['green'] || 0) / totalColorVotes) * 100 : 33,
        red: totalColorVotes > 0 ? ((colorVotes['red'] || 0) / totalColorVotes) * 100 : 33,
        violet: Math.max(5, 100 - (totalColorVotes > 0 ? ((colorVotes['green'] || 0) / totalColorVotes) * 100 : 33) - (totalColorVotes > 0 ? ((colorVotes['red'] || 0) / totalColorVotes) * 100 : 33)),
      },
      size: finalSize,
      sizeConfidence: Math.min(85, Math.max(55, sizeConf + this.jitter(3))),
      sizeProbabilities: {
        big: totalSizeVotes > 0 ? ((sizeVotes['Big'] || 0) / totalSizeVotes) * 100 : 50,
        small: totalSizeVotes > 0 ? ((sizeVotes['Small'] || 0) / totalSizeVotes) * 100 : 50,
      },
      overallConfidence: Math.min(83, Math.max(58, (colorConf + sizeConf) / 2 + this.jitter(3))),
      patternsDetected: [...this.patternsDetected, 'Monte Carlo simulation', 'Momentum analysis'],
    }
  }

  // ===== Helper Methods =====

  private normalizeBaseColor(color: string): string {
    const c = color.toLowerCase()
    if (c.includes('green')) return 'green'
    if (c.includes('red')) return 'red'
    if (c === 'violet') return 'violet'
    return 'red'
  }

  private trainMarkov(sequence: string[], order: number): TransitionMap {
    if (sequence.length < order + 5) return {}
    const transitions: TransitionMap = {}
    for (let i = 0; i < sequence.length - order; i++) {
      const state = order === 1 ? sequence[i] : sequence.slice(i, i + order).join('|')
      const next = sequence[i + order]
      if (!transitions[state]) transitions[state] = {}
      transitions[state][next] = (transitions[state][next] || 0) + 1
    }
    // Convert to probabilities
    for (const state of Object.keys(transitions)) {
      const total = Object.values(transitions[state]).reduce((a, b) => a + b, 0)
      for (const next of Object.keys(transitions[state])) {
        transitions[state][next] = transitions[state][next] / total
      }
    }
    return transitions
  }

  private markovPredict(model: TransitionMap, seq: string[], order: number): { prediction: string; confidence: number } | null {
    if (seq.length < order || Object.keys(model).length === 0) return null
    const state = order === 1 ? seq[seq.length - 1] : seq.slice(-order).join('|')
    const transitions = model[state]
    if (!transitions) return null
    let best = ''
    let bestProb = 0
    for (const [next, prob] of Object.entries(transitions)) {
      if (prob > bestProb) { best = next; bestProb = prob }
    }
    return best ? { prediction: best, confidence: bestProb * 100 } : null
  }

  private calcFrequency(seq: string[]): Record<string, number> {
    const freq: Record<string, number> = {}
    for (const val of seq) freq[val] = (freq[val] || 0) + 1
    const total = seq.length
    for (const key of Object.keys(freq)) freq[key] = freq[key] / total
    return freq
  }

  private analyzeNumberTrends(numbers: number[]) {
    if (numbers.length < 5) return {}
    const bigCount = numbers.filter(n => n >= 5).length
    const smallCount = numbers.filter(n => n < 5).length
    const total = numbers.length
    return {
      average: numbers.reduce((a, b) => a + b, 0) / total,
      bigProbability: bigCount / total,
      smallProbability: smallCount / total,
      recentTrend: this.calcTrend(numbers.slice(-10)),
    }
  }

  private calcTrend(nums: number[]): string {
    if (nums.length < 3) return 'stable'
    const first = nums.slice(0, Math.floor(nums.length / 2))
    const second = nums.slice(Math.floor(nums.length / 2))
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length
    if (avgSecond > avgFirst + 0.5) return 'increasing'
    if (avgSecond < avgFirst - 0.5) return 'decreasing'
    return 'stable'
  }

  private detectPatterns(colors: string[], sizes: string[]): string[] {
    const patterns: string[] = []
    const recent = colors.slice(-10)

    // Alternating pattern
    let alternating = true
    for (let i = 1; i < Math.min(6, recent.length); i++) {
      if (recent[i] === recent[i - 1]) { alternating = false; break }
    }
    if (alternating && recent.length >= 4) patterns.push('Alternating color pattern detected')

    // Streak detection
    let streak = 1
    for (let i = recent.length - 2; i >= 0; i--) {
      if (recent[i] === recent[recent.length - 1]) streak++
      else break
    }
    if (streak >= 3) patterns.push(`${recent[recent.length - 1]} streak of ${streak}`)

    // Hot/cold analysis
    const last10 = colors.slice(-10)
    const greenRatio = last10.filter(c => c === 'green').length / last10.length
    if (greenRatio > 0.7) patterns.push('Green hot streak (70%+)')
    else if (greenRatio < 0.3) patterns.push('Red hot streak (70%+)')

    // Size patterns
    const recentSizes = sizes.slice(-10)
    const bigRatio = recentSizes.filter(s => s === 'Big').length / recentSizes.length
    if (bigRatio > 0.7) patterns.push('Big numbers dominant')
    else if (bigRatio < 0.3) patterns.push('Small numbers dominant')

    if (patterns.length === 0) patterns.push('Normal distribution')

    return patterns
  }

  private patternPredict(colors: string[]): { prediction: string; confidence: number } | null {
    if (colors.length < 4) return null

    // Find repeating patterns of length 2-4
    for (let len = 3; len >= 2; len--) {
      if (colors.length < len * 2) continue
      const pattern = colors.slice(-len)
      let found = false
      for (let i = colors.length - len * 2; i >= 0; i--) {
        const slice = colors.slice(i, i + len)
        if (slice.join('') === pattern.join('')) {
          const nextIdx = i + len
          if (nextIdx < colors.length) {
            return { prediction: colors[nextIdx], confidence: 65 + len * 5 }
          }
          found = true
          break
        }
      }
    }
    return null
  }

  private monteCarloSim(sequence: string[], simulations: number): Record<string, number> {
    const lookback = Math.min(30, sequence.length)
    const recent = sequence.slice(-lookback)
    const predictions: Record<string, number> = {}

    for (let s = 0; s < simulations; s++) {
      // Build mini-transition for this simulation (with noise)
      const idx = Math.floor(Math.random() * (recent.length - 1))
      const next = recent[Math.min(idx + 1, recent.length - 1)]
      predictions[next] = (predictions[next] || 0) + 1
    }

    const total = Object.values(predictions).reduce((a, b) => a + b, 0)
    for (const key of Object.keys(predictions)) predictions[key] = predictions[key] / total
    return predictions
  }

  private calcMomentum(sequence: string[], window: number = 8): number {
    if (sequence.length < window) return 0.5
    const recent = sequence.slice(-window)
    let changes = 0
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] !== recent[i - 1]) changes++
    }
    return changes / (recent.length - 1)
  }

  private maxKey(obj: Record<string, number>): string | null {
    let max = -Infinity
    let key: string | null = null
    for (const [k, v] of Object.entries(obj)) {
      if (v > max) { max = v; key = k }
    }
    return key
  }

  private avgConfidence(arr: number[]): number {
    if (arr.length === 0) return 65
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  private jitter(range: number): number {
    return (Math.random() - 0.5) * range * 2
  }
}

export const predictionEngine = new PredictionEngine()
