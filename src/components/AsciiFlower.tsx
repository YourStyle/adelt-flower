import React, { useEffect, useRef, useState, useCallback } from 'react'

const TOTAL_FRAMES = 109
const ASCII_CHARS = ' .LTEAD'
const STEM_CHARS = ' ....A...D...E...L...T'
const BG_THRESHOLD = 35

// Chrysanthemum petal - elongated with wider tip
const PETAL_CHARS = ['A', 'D', 'E', 'L', 'T']

const PETAL_TEMPLATES = [
  // Smooth teardrop petal
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
  // Wider rounded petal
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
  // Slender elegant petal
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
  spinSpeed: number     // continuous rotation speed (deg/s)
  swayPeriod: number    // horizontal oscillation period (s)
  dragFactor: number    // per-petal air resistance variation
}

export function AsciiFlower() {
  const width = 140
  const height = 85 // Reduced to cut off stem

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ascii, setAscii] = useState<string>('')
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const imagesRef = useRef<HTMLImageElement[]>([])
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

  // For bud sway — spring physics
  const [budSway, setBudSway] = useState({ x: 0, y: 0 })
  const budSwayTargetRef = useRef({ x: 0, y: 0 })
  const budSwayVelocityRef = useRef({ x: 0, y: 0 })
  const budSwayAnimationRef = useRef<number>()

  // Mouse displacement effect on flower characters
  const mouseCharTargetRef = useRef<{ x: number; y: number } | null>(null)
  const [mouseDisplace, setMouseDisplace] = useState<{ x: number; y: number; strength: number } | null>(null)

  // Store position from the last frame to keep flower stable
  const contentCenterXRef = useRef<number | null>(null)
  const stemBottomRef = useRef<number | null>(null)

  useEffect(() => {
    const loadImages = async () => {
      const images: HTMLImageElement[] = []

      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const img = new Image()
        img.src = `/frames/frame_${String(i).padStart(3, '0')}.jpg`

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            setLoadProgress(Math.round(((i + 1) / TOTAL_FRAMES) * 100))
            resolve()
          }
          img.onerror = reject
        })

        images.push(img)
      }

      imagesRef.current = images

      // Calculate stem bottom Y from the LAST frame (fully open flower)
      const lastImg = images[images.length - 1]
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = lastImg.width
      tempCanvas.height = lastImg.height
      const tempCtx = tempCanvas.getContext('2d')
      if (tempCtx) {
        tempCtx.drawImage(lastImg, 0, 0)
        const imageData = tempCtx.getImageData(0, 0, lastImg.width, lastImg.height)
        const pixels = imageData.data

        // Find content center X and stem bottom Y from last frame
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

      setIsLoading(false)
    }

    loadImages()
  }, [])

  const convertToAscii = useCallback((img: HTMLImageElement): string => {
    const canvas = canvasRef.current
    if (!canvas) return ''

    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data

    const cellWidth = canvas.width / width
    const cellHeight = canvas.height / height

    let result = ''

    for (let y = 0; y < height; y++) {
      let line = ''
      for (let x = 0; x < width; x++) {
        let totalBrightness = 0
        let count = 0

        for (let py = 0; py < cellHeight; py++) {
          for (let px = 0; px < cellWidth; px++) {
            const sourceX = Math.floor(x * cellWidth + px)
            const sourceY = Math.floor(y * cellHeight + py)

            if (sourceX < 0 || sourceX >= canvas.width || sourceY < 0 || sourceY >= canvas.height) {
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
          const isStemArea = y > height * 0.6
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
  }, [width, height])

  useEffect(() => {
    if (isLoading || imagesRef.current.length === 0) return

    const SWAY_START = 60
    const SWAY_END = TOTAL_FRAMES - 1

    const animate = (timestamp: number) => {
      if (isPlaying) {
        // Slower animation: growing ~20fps, swaying ~12fps
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
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isLoading, isPlaying, animationPhase])

  useEffect(() => {
    if (imagesRef.current[currentFrame]) {
      setAscii(convertToAscii(imagesRef.current[currentFrame]))
    }
  }, [currentFrame, convertToAscii])

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

        // Track cursor in character grid coordinates for displacement
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

    // Spawn petals when leaving flower — with cooldown
    const now2 = Date.now()
    if (wasOverFlowerRef.current && !isCurrentlyOverFlower && lastOverPositionRef.current && lastMousePositionRef.current && now2 - lastPetalTimeRef.current > 800) {
      const dx = currentPos.x - lastOverPositionRef.current.x
      const dy = currentPos.y - lastOverPositionRef.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const isHorizontalExit = Math.abs(dx) > Math.abs(dy) * 0.5

      if (dist > 5 && isHorizontalExit) {
        lastPetalTimeRef.current = now2
        // Arc trajectory: initial upward + sideways push, then slow fall
        const dirX = (dx / dist) * (0.5 + Math.random() * 0.5)

        // Get flower position for landing Y - land at the base of stem
        const pre = preRef.current
        const preRect = pre?.getBoundingClientRect()
        // Land at the bottom edge of the flower (at stem base)
        const landingY = preRect ? preRect.bottom - 30 + Math.random() * 20 : window.innerHeight - 150

        // Generate 3-4 random edge characters to tear off
        const templateIdx = Math.floor(Math.random() * PETAL_TEMPLATES.length)
        const template = PETAL_TEMPLATES[templateIdx]
        const edgeChars: { row: number; col: number }[] = []

        // Find edge characters (first or last non-space in each row)
        template.forEach((line, row) => {
          for (let col = 0; col < line.length; col++) {
            if (line[col] !== ' ') {
              // Check if it's an edge (next to space or boundary)
              const isLeftEdge = col === 0 || line[col - 1] === ' '
              const isRightEdge = col === line.length - 1 || line[col + 1] === ' '
              if (isLeftEdge || isRightEdge) {
                edgeChars.push({ row, col })
              }
            }
          }
        })

        // Pick 3-4 random edge characters to tear at different times
        const numTears = 3 + Math.floor(Math.random() * 2)
        const shuffled = edgeChars.sort(() => Math.random() - 0.5).slice(0, numTears)
        const tornChars = shuffled.map((char, i) => ({
          ...char,
          tearTime: 0.5 + Math.random() * 2 + i * 0.3 // Staggered tear times
        }))

        // Slight random tilt
        const randomTilt = (Math.random() - 0.5) * 40
        // Fall vertically with slight tilt, not horizontal
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

  // Pollen emitter — gentle particles rising from the bud
  useEffect(() => {
    if (animationPhase !== 'swaying') return
    const emit = setInterval(() => {
      const pre = preRef.current
      if (!pre) return
      const rect = pre.getBoundingClientRect()
      // Emit from the top 30% of the flower (bud area)
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

  // Spring-physics sway with ambient wind
  useEffect(() => {
    const animateSway = () => {
      const now = Date.now() / 1000
      const target = budSwayTargetRef.current
      const vel = budSwayVelocityRef.current

      // Ambient wind sway when mouse is not over flower
      const hasMouseInput = Math.abs(target.x) > 0.1 || Math.abs(target.y) > 0.1
      const windX = hasMouseInput ? 0
        : Math.sin(now * 0.4) * 1.8 + Math.sin(now * 0.7 + 0.5) * 1.0 + Math.sin(now * 1.3) * 0.5
      const finalTargetX = target.x + windX
      const finalTargetY = target.y

      // Damped spring: soft stiffness + moderate damping = airy, bouncy
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

      // Smooth mouse displacement position — lazy, gentle tracking
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

      budSwayAnimationRef.current = requestAnimationFrame(animateSway)
    }
    budSwayAnimationRef.current = requestAnimationFrame(animateSway)
    return () => {
      if (budSwayAnimationRef.current) {
        cancelAnimationFrame(budSwayAnimationRef.current)
      }
    }
  }, [])

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

  const restartAnimation = () => {
    setCurrentFrame(0)
    setAnimationPhase('growing')
    setIsPlaying(true)
    swayDirectionRef.current = 1
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'radial-gradient(ellipse at 50% 40%, #1a1a2e 0%, #0d0d15 70%, #050508 100%)',
        color: '#c9b99a',
        fontFamily: '"Courier New", monospace',
        letterSpacing: '3px',
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
        background: 'radial-gradient(ellipse at 50% 40%, #1a1a2e 0%, #0d0d15 70%, #050508 100%)',
      }}
      onMouseMove={handleMouseMove}
    >
      {/* Vignette overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
        zIndex: 10,
      }} />

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <pre
          ref={preRef}
          style={{
            color: '#d4c5a9',
            fontSize: '10px',
            lineHeight: '10px',
            letterSpacing: '-0.5px',
            fontFamily: '"Courier New", monospace',
            textShadow: '0 0 8px rgba(201,185,154,0.08), 0 0 2px rgba(201,185,154,0.05)',
            margin: 0,
            cursor: 'default',
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

            // Per-character effects when cursor is nearby
            const CHAR_RADIUS = 12
            if (mc && mc.strength > 0.05 && absDy < CHAR_RADIUS) {
              return (
                <div key={i} style={(totalX || totalY) ? { transform: `translate(${totalX}px, ${totalY}px)` } : undefined}>
                  {line.split('').map((char, j) => {
                    if (char === ' ') return <span key={j}> </span>

                    const dx = j - mc.x
                    const dist2d = Math.sqrt(dx * dx + dy * dy)
                    const GLOW_SIGMA = 8
                    const intensity = Math.exp(-(dist2d * dist2d) / (2 * GLOW_SIGMA * GLOW_SIGMA)) * mc.strength

                    // Wave delay: effect arrives later for farther chars
                    const waveDelay = dist2d * 0.04
                    const wavePhase = now / 600 - waveDelay
                    const wavePulse = (Math.sin(wavePhase) * 0.5 + 0.5) * intensity

                    // Warm glow: cream → golden white
                    const r = Math.round(212 + 43 * intensity)
                    const g = Math.round(197 + 48 * intensity)
                    const b = Math.round(169 + 56 * intensity)
                    const glow = intensity > 0.25
                      ? `0 0 ${4 + intensity * 10}px rgba(235,220,180,${intensity * 0.35}), 0 0 ${1 + intensity * 3}px rgba(255,245,220,${intensity * 0.2})`
                      : ''

                    // Scale pulse
                    const scale = 1 + wavePulse * 0.15

                    // Slight vertical lift toward cursor
                    const lift = -dy * intensity * 0.4

                    if (intensity < 0.02) return <span key={j}>{char}</span>

                    return (
                      <span
                        key={j}
                        style={{
                          display: 'inline-block',
                          color: `rgb(${r},${g},${b})`,
                          transform: scale !== 1 || lift ? `scale(${scale}) translateY(${lift}px)` : undefined,
                          textShadow: glow || undefined,
                        }}
                      >
                        {char}
                      </span>
                    )
                  })}
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

          // Air resistance physics
          const gravity = 100
          const drag = 1.6 * petal.dragFactor
          const vTerminal = gravity / drag
          const tau = 1 / drag
          const v0 = petal.velocityY * 10

          // Position calculator for any time t
          const posAt = (t: number) => {
            const py = petal.startY + vTerminal * t + tau * (v0 - vTerminal) * (1 - Math.exp(-t / tau))
            const swayAmp = 25 + (petal.id % 4) * 8
            const sw = Math.sin(t * Math.PI * 2 / petal.swayPeriod + petal.id * 0.7) * swayAmp
            const dr = petal.velocityX * t * 30
            const px = petal.startX + dr + sw
            return { x: px, y: py }
          }

          const pos = posAt(elapsed)

          // Rotation
          const tumble = Math.sin(elapsed * 1.3 + petal.rotation * 0.08) * 30 + Math.sin(elapsed * 0.8) * 15
          const spin = elapsed * petal.spinSpeed
          const currentRotation = petal.baseRotation + tumble + spin

          // Animate letters
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

          // 3D tumble + curl
          const flipPhaseY = petal.id * 1.3 + petal.rotation * 0.05
          const flipPhaseX = petal.id * 0.9 + petal.rotation * 0.03
          const flipY = Math.sin(elapsed * 2.0 + flipPhaseY) * 75
          const flipX = Math.sin(elapsed * 1.2 + flipPhaseX) * 40
          const curlAmount = Math.sin(elapsed * 0.9 + petal.id * 0.7) * 45
          const arcAmount = Math.sin(elapsed * 0.6 + petal.id * 1.1) * 12

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

          // Ghost trail: 3 echoes at past positions
          const ghosts = [0.08, 0.18, 0.3]
            .filter(dt => elapsed > dt)
            .map((dt, gi) => {
              const gp = posAt(elapsed - dt)
              const gRot = petal.baseRotation + Math.sin((elapsed - dt) * 1.3 + petal.rotation * 0.08) * 30 + (elapsed - dt) * petal.spinSpeed
              return (
                <pre
                  key={`g${petal.id}-${gi}`}
                  style={{
                    position: 'fixed',
                    left: gp.x - 40,
                    top: gp.y - 50,
                    color: '#c9b99a',
                    fontSize: '10px',
                    lineHeight: '10px',
                    letterSpacing: '-1px',
                    fontFamily: '"Courier New", monospace',
                    opacity: opacity * (0.12 - gi * 0.03),
                    transform: `rotate(${gRot}deg) scale(${1 + gi * 0.02})`,
                    pointerEvents: 'none',
                    margin: 0,
                    whiteSpace: 'pre',
                    filter: `blur(${1 + gi}px)`,
                  }}
                >
                  {animatedTemplate.join('\n')}
                </pre>
              )
            })

          return (
            <React.Fragment key={petal.id}>
              {ghosts}
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
                  transform: `perspective(300px) rotateY(${flipY}deg) rotateX(${flipX}deg) scale(${scaleX}, ${scaleY}) rotate(${currentRotation}deg)`,
                  transformStyle: 'preserve-3d',
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  textShadow: '0 0 6px rgba(201,185,154,0.12)',
                  margin: 0,
                  whiteSpace: 'pre'
                }}
              >
                {animatedTemplate.map((row, ri) => {
                  const rowCount = animatedTemplate.length
                  const rowT = rowCount > 1 ? (ri / (rowCount - 1)) - 0.5 : 0
                  const arcBow = (0.25 - rowT * rowT) * 4 * arcAmount
                  const curl = rowT * curlAmount
                  const bowX = (0.25 - rowT * rowT) * 4 * curlAmount * 0.4
                  return (
                    <div key={ri} style={{
                      transform: `perspective(150px) translateX(${arcBow}px) rotateY(${curl}deg) rotateX(${bowX}deg)`
                    }}>
                      {row}
                    </div>
                  )
                })}
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
                textShadow: '0 0 4px rgba(212,184,118,0.3)',
                pointerEvents: 'none',
              }}
            >
              {t > 2 ? '\u00B7' : '.'}
            </span>
          )
        })}
      </div>

      {/* Parallax background — faint drifting symbols behind everything */}
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

      {/* Minimal controls — appear on hover at bottom */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '20px 0 24px',
          opacity: 0,
          transition: 'opacity 0.6s ease',
          zIndex: 20,
          background: 'linear-gradient(transparent, rgba(5,5,8,0.8))',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
      >
        <button
          onClick={restartAnimation}
          style={{
            background: 'none',
            color: '#6b5f4f',
            border: '1px solid #2a2520',
            padding: '6px 14px',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: '"Courier New", monospace',
            letterSpacing: '2px',
            textTransform: 'lowercase',
            transition: 'color 0.3s, border-color 0.3s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#c9b99a'; e.currentTarget.style.borderColor = '#4a3f2f' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b5f4f'; e.currentTarget.style.borderColor = '#2a2520' }}
        >
          restart
        </button>

        <button
          onClick={() => setIsPlaying(prev => !prev)}
          style={{
            background: 'none',
            color: '#6b5f4f',
            border: '1px solid #2a2520',
            padding: '6px 14px',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: '"Courier New", monospace',
            letterSpacing: '2px',
            textTransform: 'lowercase',
            minWidth: '60px',
            transition: 'color 0.3s, border-color 0.3s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#c9b99a'; e.currentTarget.style.borderColor = '#4a3f2f' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b5f4f'; e.currentTarget.style.borderColor = '#2a2520' }}
        >
          {isPlaying ? 'pause' : 'play'}
        </button>

        <input
          type="range"
          min={0}
          max={TOTAL_FRAMES - 1}
          value={currentFrame}
          onChange={(e) => {
            setIsPlaying(false)
            setAnimationPhase('growing')
            setCurrentFrame(Number(e.target.value))
          }}
          style={{ width: '100px', cursor: 'pointer', opacity: 0.4 }}
        />
      </div>
    </div>
  )
}
