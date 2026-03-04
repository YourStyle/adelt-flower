import { useEffect, useRef, useState, useCallback } from 'react'

const TOTAL_FRAMES = 109
const ASCII_CHARS = ' .LTEAD'
const STEM_CHARS = ' ....A...D...E...L...T'
const BG_THRESHOLD = 35

const PETAL_CHARS = ['A', 'D', 'E', 'L', 'T']

const PETAL_TEMPLATES = [
  // Wide smooth petal
  [
    '     AAAAAA',
    '    ADDDDDDA',
    '   ADELLLLEDA',
    '  ADELTTTTLEDA',
    '  ADELTTTTLEDA',
    '   ADELLLLEDA',
    '    ADELLLEDA',
    '     ADELEDA',
    '      ADEDA',
    '       ADA',
    '        A',
  ],
  // Rounded full petal
  [
    '    AAAAAAA',
    '   ADDDDDDDA',
    '  ADELLLLEDA',
    '  ADELTTTTLEDA',
    '  ADELTTTTLEDA',
    '   ADELLLLEDA',
    '    ADELLEDA',
    '     ADELEDA',
    '      ADEDA',
    '       ADA',
    '        A',
  ],
  // Elegant tapered petal
  [
    '       AAAA',
    '      ADDDDA',
    '     ADELLEDA',
    '    ADELTTLEDA',
    '   ADELTTTTLEDA',
    '    ADELTTLEDA',
    '     ADELLEDA',
    '      ADELEDA',
    '       ADEDA',
    '        ADA',
    '         A',
  ],
]

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

export function AsciiFlowerFast() {
  const width = 140
  const height = 85

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

  const wasOverFlowerRef = useRef(false)
  const lastOverPositionRef = useRef<{ x: number; y: number } | null>(null)
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null)
  const lastPetalTimeRef = useRef(0)

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
      setIsLoading(false)
    }

    loadImages()
  }, [])

  const findFlowerBounds = useCallback((ctx: CanvasRenderingContext2D, imgWidth: number, imgHeight: number) => {
    const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight)
    const pixels = imageData.data

    let minX = imgWidth, maxX = 0, minY = imgHeight, maxY = 0

    for (let y = 0; y < imgHeight; y++) {
      for (let x = 0; x < imgWidth; x++) {
        const i = (y * imgWidth + x) * 4
        const brightness = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114

        if (brightness > BG_THRESHOLD) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    return { minX, maxX, minY, maxY }
  }, [])

  const convertToAscii = useCallback((img: HTMLImageElement): string => {
    const canvas = canvasRef.current
    if (!canvas) return ''

    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)

    const bounds = findFlowerBounds(ctx, img.width, img.height)
    const flowerCenterX = (bounds.minX + bounds.maxX) / 2
    const flowerCenterY = (bounds.minY + bounds.maxY) / 2

    const targetCenterX = img.width / 2
    const targetCenterY = img.height * 0.45

    const offsetX = targetCenterX - flowerCenterX
    const offsetY = targetCenterY - flowerCenterY

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
            const sourceX = Math.floor(x * cellWidth + px - offsetX)
            const sourceY = Math.floor(y * cellHeight + py - offsetY)

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
          // Use STEM_CHARS for lower part (stem area - bottom 40%)
          const isStemArea = y > height * 0.6
          const chars = isStemArea ? STEM_CHARS : ASCII_CHARS
          // Dim the stem by reducing brightness
          const brightness = isStemArea ? avgBrightness * 0.6 : avgBrightness
          let charIndex = Math.floor((brightness / 255) * (chars.length - 1))
          // Add position-based variation for stem to avoid uniform letters
          if (isStemArea) {
            charIndex = (charIndex + x + y) % chars.length
          }
          line += chars[Math.min(charIndex, chars.length - 1)]
        }
      }
      result += line.trimEnd() + '\n'
    }

    return result
  }, [width, height, findFlowerBounds])

  useEffect(() => {
    if (isLoading || imagesRef.current.length === 0) return

    const SWAY_START = 60
    const SWAY_END = TOTAL_FRAMES - 1

    const animate = (timestamp: number) => {
      if (isPlaying) {
        // 40 FPS = 25ms per frame
        const frameTime = 25

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
    }

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
        const flowerHeight = preRect ? preRect.height : 500
        const landingY = preRect ? preRect.bottom - flowerHeight * 0.2 : window.innerHeight - 200

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
          velocityX: dirX * 0.3 + (Math.random() - 0.5) * 0.15,
          velocityY: -0.5 - Math.random() * 0.8,
          startTime: Date.now(),
          rotation: randomTilt,
          landingY: Math.max(lastOverPositionRef.current.y + 50, landingY + Math.random() * 30 - 15),
          charOffset: Math.floor(Math.random() * 5),
          baseRotation: baseRot,
          tornChars,
          spinSpeed: (Math.random() > 0.5 ? 1 : -1) * (25 + Math.random() * 45),
          swayPeriod: 1.8 + Math.random() * 1.8,
          dragFactor: 0.8 + Math.random() * 0.4,
        }

        setFlyingPetals(prev => [...prev, newPetal])
      }
    }

    wasOverFlowerRef.current = isCurrentlyOverFlower
    lastMousePositionRef.current = currentPos
  }, [isOverFlower])

  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now()
      setFlyingPetals(prev => prev.filter(p => now - p.startTime < 12000))
    }, 1000)
    return () => clearInterval(cleanup)
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
        color: '#e0e0e0',
        fontFamily: 'monospace'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '20px' }}>
          Loading frames...
        </div>
        <div style={{
          width: '300px',
          height: '20px',
          background: '#333',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${loadProgress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #4a5568, #718096)',
            transition: 'width 0.1s'
          }} />
        </div>
        <div style={{ marginTop: '10px' }}>{loadProgress}%</div>
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
        gap: '15px',
        padding: '20px',
        userSelect: 'none',
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden'
      }}
      onMouseMove={handleMouseMove}
    >
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <pre
            ref={preRef}
            style={{
              color: '#e0e0e0',
              fontSize: '10px',
              lineHeight: '10px',
              letterSpacing: '-1px',
              fontFamily: '"Courier New", monospace',
              textShadow: '0 0 5px rgba(255,255,255,0.1)',
              margin: 0,
              cursor: 'default'
            }}
          >
            {ascii}
          </pre>
        </div>

        {flyingPetals.map(petal => {
          const elapsed = (now - petal.startTime) / 1000

          // Air resistance physics
          const gravity = 120
          const drag = 1.5 * petal.dragFactor
          const vTerminal = gravity / drag
          const tau = 1 / drag

          const v0 = petal.velocityY * 12

          // y(t) with drag: brief upward arc, then airy fall to terminal velocity
          const rawY = petal.startY + vTerminal * elapsed + tau * (v0 - vTerminal) * (1 - Math.exp(-elapsed / tau))

          const hasLanded = rawY >= petal.landingY

          // Landing time via Newton's method
          let landTime = elapsed
          if (hasLanded) {
            const targetDist = petal.landingY - petal.startY
            if (targetDist <= 0) {
              landTime = 0
            } else {
              const transientContrib = tau * (v0 - vTerminal)
              landTime = Math.max(0, (targetDist - transientContrib) / vTerminal)
              for (let i = 0; i < 5; i++) {
                const yAt = vTerminal * landTime + tau * (v0 - vTerminal) * (1 - Math.exp(-landTime / tau))
                const vAt = vTerminal + (v0 - vTerminal) * Math.exp(-landTime / tau)
                if (Math.abs(vAt) < 1e-6) break
                const step = (yAt - targetDist) / vAt
                landTime -= step
                if (Math.abs(step) < 1e-4) break
              }
              landTime = Math.max(0, landTime)
              if (!isFinite(landTime)) landTime = elapsed
            }
          }

          // Micro-bounce on soft landing
          const tSinceLand = hasLanded ? elapsed - landTime : 0
          const bounceHeight = 8 * Math.exp(-tSinceLand * 5) * Math.sin(tSinceLand * 8)
          const y = hasLanded ? petal.landingY - Math.max(0, bounceHeight) : rawY

          // Horizontal: pendulum sway + drift
          const swayAmp = 20 + (petal.id % 4) * 6
          const t = Math.min(elapsed, landTime)
          const sway = Math.sin(elapsed * Math.PI * 2 / petal.swayPeriod + petal.id * 0.7) * swayAmp
          const drift = petal.velocityX * t * 35
          const x = petal.startX + drift + (hasLanded ? sway * Math.exp(-tSinceLand * 1.5) : sway)

          // Rotation: visible tumble + continuous spin
          const tumble = hasLanded
            ? petal.rotation * 0.15 * Math.exp(-tSinceLand * 2)
            : Math.sin(elapsed * 1.3 + petal.rotation * 0.08) * 25 + Math.sin(elapsed * 0.8) * 12
          const spin = elapsed * petal.spinSpeed
          const currentRotation = petal.baseRotation + tumble + spin

          const charShift = Math.floor(elapsed * 2.5 + petal.charOffset) % PETAL_CHARS.length
          const template = PETAL_TEMPLATES[petal.templateIndex]
          const animatedTemplate = template.map((line, row) =>
            line.split('').map((char, col) => {
              if (char === ' ') return ' '

              const tornChar = petal.tornChars.find(t => t.row === row && t.col === col)
              if (tornChar && elapsed > tornChar.tearTime) {
                return ' '
              }

              const idx = PETAL_CHARS.indexOf(char)
              if (idx === -1) return char
              return PETAL_CHARS[(idx + charShift) % PETAL_CHARS.length]
            }).join('')
          )

          // 3D tumble + curl
          const flipPhaseY = petal.id * 1.3 + petal.rotation * 0.05
          const flipPhaseX = petal.id * 0.9 + petal.rotation * 0.03
          const flipY = hasLanded
            ? Math.sin(landTime * 2.0 + flipPhaseY) * 75 * Math.exp(-tSinceLand * 2.5)
            : Math.sin(elapsed * 2.0 + flipPhaseY) * 75
          const flipX = hasLanded
            ? Math.sin(landTime * 1.2 + flipPhaseX) * 40 * Math.exp(-tSinceLand * 2.5)
            : Math.sin(elapsed * 1.2 + flipPhaseX) * 40

          const curlAmount = hasLanded
            ? Math.sin(landTime * 0.9 + petal.id * 0.7) * 45 * Math.exp(-tSinceLand * 2)
            : Math.sin(elapsed * 0.9 + petal.id * 0.7) * 45

          // Arc bend: petal bows along its length
          const arcAmount = hasLanded
            ? Math.sin(landTime * 0.6 + petal.id * 1.1) * 12 * Math.exp(-tSinceLand * 2)
            : Math.sin(elapsed * 0.6 + petal.id * 1.1) * 12

          const scaleX = hasLanded ? 1 : 1 + Math.sin(elapsed * 1.5 + petal.id) * 0.04
          const scaleY = hasLanded ? 1 : 1 + Math.cos(elapsed * 1.2 + petal.id * 0.5) * 0.03

          const fadeDelay = 2
          const fadeDuration = 2

          let opacity = 1
          if (hasLanded && tSinceLand > fadeDelay) {
            opacity = Math.max(0, 1 - (tSinceLand - fadeDelay) / fadeDuration)
          } else if (!hasLanded) {
            opacity = Math.min(1, elapsed * 2.5)
          }

          return (
            <pre
              key={petal.id}
              style={{
                position: 'fixed',
                left: x - 50,
                top: y - 30,
                color: '#e0e0e0',
                fontSize: '7px',
                lineHeight: '7px',
                letterSpacing: '-1px',
                fontFamily: '"Courier New", monospace',
                opacity,
                transform: `perspective(300px) rotateY(${flipY}deg) rotateX(${flipX}deg) scale(${scaleX}, ${scaleY}) rotate(${currentRotation}deg)`,
                transformStyle: 'preserve-3d',
                pointerEvents: 'none',
                textShadow: '0 0 3px rgba(255,255,255,0.1)',
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
          )
        })}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        marginTop: '20px'
      }}>
        <button
          onClick={() => window.location.hash = ''}
          style={{
            background: '#4a5568',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Normal
        </button>

        <button
          onClick={restartAnimation}
          style={{
            background: '#2d3748',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Restart
        </button>

        <button
          onClick={() => setIsPlaying(prev => !prev)}
          style={{
            background: isPlaying ? '#e53e3e' : '#38a169',
            color: 'white',
            border: 'none',
            padding: '10px 25px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            minWidth: '80px'
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
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
          style={{ width: '200px', cursor: 'pointer' }}
        />

        <span style={{
          color: '#a0aec0',
          fontFamily: 'monospace',
          fontSize: '12px',
          minWidth: '100px'
        }}>
          {currentFrame + 1} / {TOTAL_FRAMES} {animationPhase === 'swaying' ? '~' : ''} (40fps)
        </span>
      </div>

      <div style={{
        color: '#718096',
        fontSize: '11px',
        fontFamily: 'monospace',
        textAlign: 'center'
      }}>
        Scroll to scrub | Space: play/pause | Move mouse out of flower
      </div>
    </div>
  )
}
