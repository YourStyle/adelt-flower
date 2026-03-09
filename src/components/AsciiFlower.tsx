import React, { useEffect, useRef, useState, useCallback } from 'react'

const TOTAL_FRAMES = 109
const ASCII_CHARS = ' .LTEAD'
const STEM_CHARS = ' ....A...D...E...L...T'
const BG_THRESHOLD = 35
const WIDTH = 140
const HEIGHT = 85

const PETAL_CHARS = ['A', 'D', 'E', 'L', 'T']

const PETAL_TEMPLATES = [
  [
    '     AAAA',
    '    ADDDDA',
    '   ADELLEDA',
    '  ADELTTLEDA',
    '  ADELTTLEDA',
    '   ADELLEDA',
    '    ADELEDA',
    '     ADEDA',
    '      ADA',
    '       A',
  ],
  [
    '    AAAAA',
    '   ADDDDDA',
    '   ADELLEDA',
    '  ADELTTLEDA',
    '  ADELTTLEDA',
    '   ADELLEDA',
    '    ADELEDA',
    '     ADEDA',
    '      ADA',
    '       A',
  ],
  [
    '       AA',
    '      ADDA',
    '     ADEDA',
    '    ADELEDA',
    '   ADELTLEDA',
    '    ADELLEDA',
    '     ADELEDA',
    '      ADEDA',
    '       ADA',
    '        A',
  ],
]

interface Spark {
  id: number
  char: string
  x: number
  y: number
  vx: number
  vy: number
  startTime: number
}

interface Pollen {
  id: number
  x: number
  y: number
  driftSpeed: number
  swayPhase: number
  startTime: number
}

interface FlyingPetal {
  id: number
  templateIndex: number
  startX: number
  startY: number
  velocityX: number
  velocityY: number
  startTime: number
  rotation: number
  landingY: number
  charOffset: number
  baseRotation: number
  tornChars: { row: number; col: number; tearTime: number }[]
  spinSpeed: number
  swayPeriod: number
  dragFactor: number
}

function convertImageToAscii(img: HTMLImageElement, canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  canvas.width = img.width
  canvas.height = img.height
  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data

  const cellWidth = canvas.width / WIDTH
  const cellHeight = canvas.height / HEIGHT

  const strideX = Math.max(1, Math.floor(cellWidth / 3))
  const strideY = Math.max(1, Math.floor(cellHeight / 3))

  let result = ''

  for (let y = 0; y < HEIGHT; y++) {
    let line = ''
    for (let x = 0; x < WIDTH; x++) {
      let totalBrightness = 0
      let count = 0

      for (let py = 0; py < cellHeight; py += strideY) {
        for (let px = 0; px < cellWidth; px += strideX) {
          const sourceX = Math.floor(x * cellWidth + px)
          const sourceY = Math.floor(y * cellHeight + py)

          if (sourceX >= canvas.width || sourceY >= canvas.height) {
            count++
            continue
          }

          const i = (sourceY * canvas.width + sourceX) * 4
          totalBrightness += (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114)
          count++
        }
      }

      const avgBrightness = totalBrightness / count

      if (avgBrightness < BG_THRESHOLD) {
        line += ' '
      } else {
        const isStemArea = y > HEIGHT * 0.6
        const chars = isStemArea ? STEM_CHARS : ASCII_CHARS
        const brightness = isStemArea ? avgBrightness * 0.6 : avgBrightness
        let charIndex = Math.floor((brightness / 255) * (chars.length - 1))
        if (isStemArea) {
          charIndex = (charIndex + x + y) % chars.length
        }
        line += chars[Math.min(charIndex, chars.length - 1)]
      }
    }
    result += line + '\n'
  }

  return result
}

export function AsciiFlower() {
  const [asciiFrames, setAsciiFrames] = useState<string[] | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const animationRef = useRef<number>()
  const lastFrameTimeRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [animationPhase, setAnimationPhase] = useState<'growing' | 'swaying'>('growing')
  const swayDirectionRef = useRef(1)

  const [flyingPetals, setFlyingPetals] = useState<FlyingPetal[]>([])
  const petalIdRef = useRef(0)

  const [sparks, setSparks] = useState<Spark[]>([])
  const sparkIdRef = useRef(0)
  const lastSparkTimeRef = useRef(0)

  const [pollen, setPollen] = useState<Pollen[]>([])
  const pollenIdRef = useRef(0)

  const wasOverFlowerRef = useRef(false)
  const lastOverPositionRef = useRef<{ x: number; y: number } | null>(null)
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null)
  const lastPetalTimeRef = useRef(0)

  // Bud sway — spring physics
  const [budSway, setBudSway] = useState({ x: 0, y: 0 })
  const budSwayTargetRef = useRef({ x: 0, y: 0 })
  const budSwayVelocityRef = useRef({ x: 0, y: 0 })

  // Mouse displacement effect
  const mouseCharTargetRef = useRef<{ x: number; y: number } | null>(null)
  const [mouseDisplace, setMouseDisplace] = useState<{ x: number; y: number; strength: number } | null>(null)

  const contentCenterXRef = useRef<number | null>(null)
  const stemBottomRef = useRef<number | null>(null)

  const [scale, setScale] = useState(1)

  // Compute scale to fit the flower within the viewport (iframe)
  useEffect(() => {
    const computeScale = () => {
      // Natural rendered size of the ASCII grid
      const naturalW = 700  // ~140 chars × 5px
      const naturalH = 850  // ~85 lines × 10px
      const vw = window.innerWidth
      const vh = window.innerHeight
      const s = Math.min(1, vw / naturalW, vh / naturalH)
      setScale(s)
    }
    computeScale()
    window.addEventListener('resize', computeScale)
    return () => window.removeEventListener('resize', computeScale)
  }, [])

  useEffect(() => {
    const loadImages = async () => {
      const loadOneImage = (i: number, retries = 3): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.src = `${import.meta.env.BASE_URL}frames/frame_${String(i).padStart(3, '0')}.jpg`
          img.onload = () => resolve(img)
          img.onerror = () => {
            if (retries > 0) {
              setTimeout(() => loadOneImage(i, retries - 1).then(resolve, reject), 500)
            } else {
              reject(new Error(`Failed to load frame ${i}`))
            }
          }
        })
      }

      let loaded = 0
      const BATCH_SIZE = 10
      const images: HTMLImageElement[] = new Array(TOTAL_FRAMES)

      for (let batch = 0; batch < TOTAL_FRAMES; batch += BATCH_SIZE) {
        const indices = Array.from({ length: Math.min(BATCH_SIZE, TOTAL_FRAMES - batch) }, (_, k) => batch + k)
        const results = await Promise.all(indices.map(i => loadOneImage(i)))
        results.forEach((img, k) => {
          images[batch + k] = img
        })
        loaded += results.length
        setLoadProgress(Math.round((loaded / TOTAL_FRAMES) * 100))
      }

      // Pre-compute all ASCII frames at load time
      const canvas = document.createElement('canvas')
      const frames: string[] = new Array(TOTAL_FRAMES)
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        frames[i] = convertImageToAscii(images[i], canvas)
      }

      // Calculate stem bottom Y from the last frame
      const lastImg = images[images.length - 1]
      canvas.width = lastImg.width
      canvas.height = lastImg.height
      const tempCtx = canvas.getContext('2d')
      if (tempCtx) {
        tempCtx.drawImage(lastImg, 0, 0)
        const imageData = tempCtx.getImageData(0, 0, lastImg.width, lastImg.height)
        const pixels = imageData.data

        let contentMinX = lastImg.width, contentMaxX = 0, stemMaxY = 0
        const stemStartY = Math.floor(lastImg.height * 0.8)

        for (let y = 0; y < lastImg.height; y++) {
          for (let x = 0; x < lastImg.width; x++) {
            const i = (y * lastImg.width + x) * 4
            const brightness = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
            if (brightness > BG_THRESHOLD) {
              if (x < contentMinX) contentMinX = x
              if (x > contentMaxX) contentMaxX = x
              if (y >= stemStartY && y > stemMaxY) stemMaxY = y
            }
          }
        }

        contentCenterXRef.current = (contentMinX + contentMaxX) / 2
        stemBottomRef.current = stemMaxY
      }

      setAsciiFrames(frames)
      setIsLoading(false)
    }

    loadImages()
  }, [])

  // Single merged animation loop: frame advance + sway physics + mouse displacement
  useEffect(() => {
    if (isLoading) return

    const SWAY_START = 60
    const SWAY_END = TOTAL_FRAMES - 1

    const animate = (timestamp: number) => {
      // --- Frame advance ---
      if (isPlaying) {
        const frameTime = animationPhase === 'swaying' ? 80 : 50

        if (timestamp - lastFrameTimeRef.current >= frameTime) {
          setCurrentFrame(prev => {
            if (animationPhase === 'growing') {
              if (prev >= TOTAL_FRAMES - 1) {
                setAnimationPhase('swaying')
                return SWAY_END
              }
              return prev + 1
            } else {
              let next = prev + swayDirectionRef.current
              if (next >= SWAY_END) {
                swayDirectionRef.current = -1
                next = SWAY_END - 1
              } else if (next <= SWAY_START) {
                swayDirectionRef.current = 1
                next = SWAY_START + 1
              }
              return next
            }
          })
          lastFrameTimeRef.current = timestamp
        }
      }

      // --- Spring-physics sway with ambient wind ---
      const now = timestamp / 1000
      const target = budSwayTargetRef.current
      const vel = budSwayVelocityRef.current

      const hasMouseInput = Math.abs(target.x) > 0.1 || Math.abs(target.y) > 0.1
      const windX = hasMouseInput ? 0
        : Math.sin(now * 0.4) * 1.8 + Math.sin(now * 0.7 + 0.5) * 1.0 + Math.sin(now * 1.3) * 0.5
      const finalTargetX = target.x + windX
      const finalTargetY = target.y

      const stiffness = 0.015
      const damping = 0.92

      setBudSway(prev => {
        vel.x += (finalTargetX - prev.x) * stiffness
        vel.y += (finalTargetY - prev.y) * stiffness
        vel.x *= damping
        vel.y *= damping

        return {
          x: prev.x + vel.x,
          y: prev.y + vel.y
        }
      })

      // --- Mouse displacement ---
      setMouseDisplace(prev => {
        const mTarget = mouseCharTargetRef.current
        if (mTarget) {
          if (prev) {
            return {
              x: prev.x + (mTarget.x - prev.x) * 0.04,
              y: prev.y + (mTarget.y - prev.y) * 0.04,
              strength: prev.strength + (1 - prev.strength) * 0.05
            }
          }
          return { x: mTarget.x, y: mTarget.y, strength: 0.02 }
        } else {
          if (prev && prev.strength > 0.005) {
            return { ...prev, strength: prev.strength * 0.96 }
          }
          return null
        }
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isLoading, isPlaying, animationPhase])

  const ascii = asciiFrames?.[currentFrame] ?? ''

  const isOverFlower = useCallback((clientX: number, clientY: number): boolean => {
    const pre = preRef.current
    if (!pre) return false

    const rect = pre.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    const charWidth = 5
    const charHeight = 10

    const charX = Math.floor(x / charWidth)
    const charY = Math.floor(y / charHeight)

    const lines = ascii.split('\n')
    if (charY >= 0 && charY < lines.length && charX >= 0 && charX < lines[charY].length) {
      return lines[charY][charX] !== ' '
    }
    return false
  }, [ascii])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const currentPos = { x: e.clientX, y: e.clientY }
    const isCurrentlyOverFlower = isOverFlower(e.clientX, e.clientY)

    if (isCurrentlyOverFlower) {
      lastOverPositionRef.current = currentPos

      const pre = preRef.current
      if (pre) {
        const rect = pre.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height * 0.3
        const relX = (e.clientX - centerX) / (rect.width / 2)
        const relY = (e.clientY - centerY) / (rect.height / 2)
        budSwayTargetRef.current = {
          x: relX * 6,
          y: Math.max(0, relY) * 2
        }

        mouseCharTargetRef.current = {
          x: (e.clientX - rect.left) / 5,
          y: (e.clientY - rect.top) / 10
        }

        // Spawn tiny sparks while moving over flower
        const now3 = Date.now()
        const prev = lastMousePositionRef.current
        const moveSpeed = prev ? Math.sqrt((e.clientX - prev.x) ** 2 + (e.clientY - prev.y) ** 2) : 0
        if (moveSpeed > 3 && now3 - lastSparkTimeRef.current > 120) {
          lastSparkTimeRef.current = now3
          const angle = Math.random() * Math.PI * 2
          const speed = 30 + Math.random() * 40
          const chars = PETAL_CHARS
          setSparks(s => [...s, {
            id: sparkIdRef.current++,
            char: chars[Math.floor(Math.random() * chars.length)],
            x: e.clientX,
            y: e.clientY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            startTime: now3,
          }])
        }
      }
    } else {
      budSwayTargetRef.current = { x: 0, y: 0 }
      mouseCharTargetRef.current = null
    }

    // Spawn petals when leaving flower
    const now2 = Date.now()
    if (wasOverFlowerRef.current && !isCurrentlyOverFlower && lastOverPositionRef.current && lastMousePositionRef.current && now2 - lastPetalTimeRef.current > 800) {
      const dx = currentPos.x - lastOverPositionRef.current.x
      const dy = currentPos.y - lastOverPositionRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const isHorizontalExit = Math.abs(dx) > Math.abs(dy) * 0.5

      if (dist > 5 && isHorizontalExit) {
        lastPetalTimeRef.current = now2
        const dirX = (dx / dist) * (0.5 + Math.random() * 0.5)

        const pre = preRef.current
        const preRect = pre?.getBoundingClientRect()
        const landingY = preRect ? preRect.bottom - 30 + Math.random() * 20 : window.innerHeight - 150

        const templateIdx = Math.floor(Math.random() * PETAL_TEMPLATES.length)
        const template = PETAL_TEMPLATES[templateIdx]
        const edgeChars: { row: number; col: number }[] = []

        template.forEach((line, row) => {
          for (let col = 0; col < line.length; col++) {
            if (line[col] !== ' ') {
              const isLeftEdge = col === 0 || line[col - 1] === ' '
              const isRightEdge = col === line.length - 1 || line[col + 1] === ' '
              if (isLeftEdge || isRightEdge) {
                edgeChars.push({ row, col })
              }
            }
          }
        })

        const numTears = 3 + Math.floor(Math.random() * 2)
        const shuffled = edgeChars.sort(() => Math.random() - 0.5).slice(0, numTears)
        const tornChars = shuffled.map((char, i) => ({
          ...char,
          tearTime: 0.5 + Math.random() * 2 + i * 0.3
        }))

        const randomTilt = (Math.random() - 0.5) * 40
        const baseRot = (Math.random() > 0.5 ? 0 : 180) + (Math.random() - 0.5) * 30

        const newPetal: FlyingPetal = {
          id: petalIdRef.current++,
          templateIndex: templateIdx,
          startX: lastOverPositionRef.current.x,
          startY: lastOverPositionRef.current.y,
          velocityX: dirX * 0.25 + (Math.random() - 0.5) * 0.15,
          velocityY: 0.1 + Math.random() * 0.2,
          startTime: Date.now(),
          rotation: randomTilt,
          landingY: Math.max(lastOverPositionRef.current.y + 50, landingY + Math.random() * 30 - 15),
          charOffset: Math.floor(Math.random() * 5),
          baseRotation: baseRot,
          tornChars,
          spinSpeed: (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 40),
          swayPeriod: 2 + Math.random() * 2,
          dragFactor: 0.8 + Math.random() * 0.4,
        }

        setFlyingPetals(prev => [...prev, newPetal])
      }
    }

    wasOverFlowerRef.current = isCurrentlyOverFlower
    lastMousePositionRef.current = currentPos
  }, [isOverFlower])

  // Clean up + spawn pollen
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now()
      setFlyingPetals(prev => prev.filter(p => now - p.startTime < 9000))
      setSparks(prev => prev.filter(s => now - s.startTime < 2000))
      setPollen(prev => prev.filter(p => now - p.startTime < 6000))
    }, 1000)
    return () => clearInterval(cleanup)
  }, [])

  // Pollen emitter
  useEffect(() => {
    if (animationPhase !== 'swaying') return
    const emit = setInterval(() => {
      const pre = preRef.current
      if (!pre) return
      const rect = pre.getBoundingClientRect()
      const budTop = rect.top + rect.height * 0.05
      const budBottom = rect.top + rect.height * 0.3
      const budLeft = rect.left + rect.width * 0.3
      const budRight = rect.left + rect.width * 0.7

      setPollen(prev => {
        if (prev.length >= 12) return prev
        return [...prev, {
          id: pollenIdRef.current++,
          x: budLeft + Math.random() * (budRight - budLeft),
          y: budTop + Math.random() * (budBottom - budTop),
          driftSpeed: 8 + Math.random() * 12,
          swayPhase: Math.random() * Math.PI * 2,
          startTime: Date.now(),
        }]
      })
    }, 800 + Math.random() * 400)
    return () => clearInterval(emit)
  }, [animationPhase])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setIsPlaying(false)
    setAnimationPhase('growing')

    const delta = e.deltaY > 0 ? 1 : -1
    setCurrentFrame(prev => {
      const next = prev + delta
      if (next < 0) return 0
      if (next >= TOTAL_FRAMES) return TOTAL_FRAMES - 1
      return next
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault()
          setIsPlaying(prev => !prev)
          break
        case 'ArrowRight':
          setIsPlaying(false)
          setAnimationPhase('growing')
          setCurrentFrame(prev => Math.min(prev + 1, TOTAL_FRAMES - 1))
          break
        case 'ArrowLeft':
          setIsPlaying(false)
          setAnimationPhase('growing')
          setCurrentFrame(prev => Math.max(prev - 1, 0))
          break
        case 'Home':
          setAnimationPhase('growing')
          setCurrentFrame(0)
          break
        case 'End':
          setAnimationPhase('swaying')
          setCurrentFrame(TOTAL_FRAMES - 1)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'transparent',
        color: '#c9b99a',
        fontFamily: '"Courier New", monospace',
        letterSpacing: '3px',
        zoom: scale,
      }}>
        <div style={{ fontSize: '14px', marginBottom: '30px', opacity: 0.6, textTransform: 'lowercase' }}>
          {loadProgress < 100 ? '...' : ''}
        </div>
        <div style={{
          width: '120px',
          height: '1px',
          background: '#2a2a3e',
          borderRadius: '1px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${loadProgress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #4a3f2f, #c9b99a)',
            transition: 'width 0.3s ease-out'
          }} />
        </div>
      </div>
    )
  }

  const now = Date.now()

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'transparent',
        zoom: scale,
      }}
      onMouseMove={handleMouseMove}
    >
      <div style={{ position: 'relative', zIndex: 1, contain: 'layout style' }}>
        <pre
          ref={preRef}
          style={{
            color: '#d4c5a9',
            fontSize: '10px',
            lineHeight: '10px',
            letterSpacing: '-0.5px',
            fontFamily: '"Courier New", monospace',
            margin: 0,
            cursor: 'default',
            willChange: 'transform',
          }}
        >
          {ascii.split('\n').map((line, i, arr) => {
            const t = arr.length > 1 ? 1 - i / (arr.length - 1) : 0
            const bend = t * t * t
            const bendX = budSway.x * bend * 18

            // Soft ripple wave emanating from cursor
            const mc = mouseDisplace
            let rippleX = 0
            let rippleY = 0
            const dy = mc ? i - mc.y : 999
            const absDy = Math.abs(dy)

            if (mc && mc.strength > 0.005) {
              const SIGMA = 12
              const envelope = Math.exp(-(dy * dy) / (2 * SIGMA * SIGMA))
              const phase = now / 800 + absDy * 0.3
              rippleX = Math.sin(phase) * envelope * mc.strength * 4
              rippleY = Math.cos(phase * 0.7 + 1) * envelope * mc.strength * 2
            }

            const totalX = bendX + rippleX
            const totalY = rippleY

            // Per-character glow near cursor — reduced radius, no textShadow for perf
            const CHAR_RADIUS = 8
            if (mc && mc.strength > 0.1 && absDy < CHAR_RADIUS) {
              // Only wrap chars within a horizontal window around cursor
              const cursorCol = Math.round(mc.x)
              const colStart = Math.max(0, cursorCol - CHAR_RADIUS)
              const colEnd = Math.min(line.length, cursorCol + CHAR_RADIUS)

              const before = line.slice(0, colStart)
              const middle = line.slice(colStart, colEnd)
              const after = line.slice(colEnd)

              return (
                <div key={i} style={(totalX || totalY) ? { transform: `translate(${totalX}px, ${totalY}px)` } : undefined}>
                  {before}
                  {middle.split('').map((char, jj) => {
                    const j = colStart + jj
                    if (char === ' ') return <span key={j}> </span>

                    const dx = j - mc.x
                    const dist2d = Math.sqrt(dx * dx + dy * dy)
                    const GLOW_SIGMA = 6
                    const intensity = Math.exp(-(dist2d * dist2d) / (2 * GLOW_SIGMA * GLOW_SIGMA)) * mc.strength

                    if (intensity < 0.05) return <span key={j}>{char}</span>

                    const r = Math.round(212 + 43 * intensity)
                    const g = Math.round(197 + 48 * intensity)
                    const b = Math.round(169 + 56 * intensity)

                    return (
                      <span
                        key={j}
                        style={{
                          display: 'inline-block',
                          color: `rgb(${r},${g},${b})`,
                        }}
                      >
                        {char}
                      </span>
                    )
                  })}
                  {after}
                </div>
              )
            }

            return (
              <div key={i} style={(totalX || totalY) ? { transform: `translate(${totalX}px, ${totalY}px)` } : undefined}>
                {line}
              </div>
            )
          })}
        </pre>

        {/* Falling ASCII petals with ghost trails */}
        {flyingPetals.map(petal => {
          const elapsed = (now - petal.startTime) / 1000

          const gravity = 100
          const drag = 1.6 * petal.dragFactor
          const vTerminal = gravity / drag
          const tau = 1 / drag
          const v0 = petal.velocityY * 10

          const posAt = (t: number) => {
            const py = petal.startY + vTerminal * t + tau * (v0 - vTerminal) * (1 - Math.exp(-t / tau))
            const swayAmp = 25 + (petal.id % 4) * 8
            const sw = Math.sin(t * Math.PI * 2 / petal.swayPeriod + petal.id * 0.7) * swayAmp
            const dr = petal.velocityX * t * 30
            const px = petal.startX + dr + sw
            return { x: px, y: py }
          }

          const pos = posAt(elapsed)

          const tumble = Math.sin(elapsed * 1.3 + petal.rotation * 0.08) * 30 + Math.sin(elapsed * 0.8) * 15
          const spin = elapsed * petal.spinSpeed
          const currentRotation = petal.baseRotation + tumble + spin

          const charShift = Math.floor(elapsed * 2.5 + petal.charOffset) % PETAL_CHARS.length
          const template = PETAL_TEMPLATES[petal.templateIndex]
          const animatedTemplate = template.map((line, row) =>
            line.split('').map((char, col) => {
              if (char === ' ') return ' '
              const tornChar = petal.tornChars.find(t => t.row === row && t.col === col)
              if (tornChar && elapsed > tornChar.tearTime) return ' '
              const idx = PETAL_CHARS.indexOf(char)
              if (idx === -1) return char
              return PETAL_CHARS[(idx + charShift) % PETAL_CHARS.length]
            }).join('')
          )


          const scaleX = 1 + Math.sin(elapsed * 1.5 + petal.id) * 0.04
          const scaleY = 1 + Math.cos(elapsed * 1.2 + petal.id * 0.5) * 0.03

          const fadeInEnd = 0.4
          const lifespan = 8
          let opacity = 1
          if (elapsed < fadeInEnd) {
            opacity = elapsed / fadeInEnd
          } else {
            opacity = Math.max(0, 1 - ((elapsed - fadeInEnd) / (lifespan - fadeInEnd)) ** 2)
          }

          // Ghost trail: single faded echo (no blur filter for Safari perf)
          const ghost = elapsed > 0.15 ? (() => {
            const gp = posAt(elapsed - 0.15)
            const gRot = petal.baseRotation + Math.sin((elapsed - 0.15) * 1.3 + petal.rotation * 0.08) * 30 + (elapsed - 0.15) * petal.spinSpeed
            return (
              <pre
                key={`g${petal.id}`}
                style={{
                  position: 'fixed',
                  left: gp.x - 40,
                  top: gp.y - 50,
                  color: '#c9b99a',
                  fontSize: '10px',
                  lineHeight: '10px',
                  letterSpacing: '-1px',
                  fontFamily: '"Courier New", monospace',
                  opacity: opacity * 0.1,
                  transform: `rotate(${gRot}deg)`,
                  pointerEvents: 'none',
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {animatedTemplate.join('\n')}
              </pre>
            )
          })() : null

          return (
            <React.Fragment key={petal.id}>
              {ghost}
              <pre
                style={{
                  position: 'fixed',
                  left: pos.x - 40,
                  top: pos.y - 50,
                  color: '#c9b99a',
                  fontSize: '10px',
                  lineHeight: '10px',
                  letterSpacing: '-1px',
                  fontFamily: '"Courier New", monospace',
                  opacity,
                  transform: `rotate(${currentRotation}deg) scale(${scaleX}, ${scaleY})`,
                  pointerEvents: 'none',
                  margin: 0,
                  whiteSpace: 'pre'
                }}
              >
                {animatedTemplate.join('\n')}
              </pre>
            </React.Fragment>
          )
        })}

        {/* Tiny character sparks flying off flower on hover */}
        {sparks.map(spark => {
          const t = (now - spark.startTime) / 1000
          const sx = spark.x + spark.vx * t
          const sy = spark.y + spark.vy * t + 40 * t * t
          const lifespan = 1.8
          const opacity = Math.max(0, 1 - (t / lifespan) ** 1.5)
          const rot = t * (spark.id % 2 ? 180 : -180)
          return (
            <span
              key={spark.id}
              style={{
                position: 'fixed',
                left: sx,
                top: sy,
                color: '#c9b99a',
                fontSize: '9px',
                fontFamily: '"Courier New", monospace',
                opacity,
                transform: `rotate(${rot}deg)`,
                pointerEvents: 'none',
              }}
            >
              {spark.char}
            </span>
          )
        })}

        {/* Pollen particles floating up from bud */}
        {pollen.map(p => {
          const t = (now - p.startTime) / 1000
          const py = p.y - p.driftSpeed * t
          const px = p.x + Math.sin(t * 1.5 + p.swayPhase) * 15 + Math.sin(t * 0.7 + p.swayPhase * 2) * 8
          const lifespan = 5
          const fadeIn = Math.min(1, t * 2)
          const fadeOut = Math.max(0, 1 - ((t - 1) / (lifespan - 1)) ** 2)
          const opacity = fadeIn * fadeOut * 0.5
          return (
            <span
              key={p.id}
              style={{
                position: 'fixed',
                left: px,
                top: py,
                color: '#d4b876',
                fontSize: '6px',
                fontFamily: '"Courier New", monospace',
                opacity,
                pointerEvents: 'none',
              }}
            >
              {t > 2 ? '\u00B7' : '.'}
            </span>
          )
        })}
      </div>

      {/* Parallax background */}
      {animationPhase === 'swaying' && Array.from({ length: 6 }, (_, i) => {
        const seed = i * 137.5
        const t = now / 1000
        const px = (Math.sin(t * 0.1 + seed) * 0.5 + 0.5) * 100
        const py = (Math.cos(t * 0.08 + seed * 0.7) * 0.5 + 0.5) * 100
        const chars = ['.', '\u00B7', ',', '`', "'"]
        return (
          <span
            key={`bg${i}`}
            style={{
              position: 'fixed',
              left: `${px}%`,
              top: `${py}%`,
              color: '#3d3525',
              fontSize: '8px',
              fontFamily: '"Courier New", monospace',
              opacity: 0.3 + Math.sin(t * 0.3 + seed) * 0.15,
              pointerEvents: 'none',
            }}
          >
            {chars[i % chars.length]}
          </span>
        )
      })}
    </div>
  )
}
