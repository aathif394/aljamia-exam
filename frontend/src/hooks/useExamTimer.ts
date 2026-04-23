import { useState, useEffect } from 'react'

interface TimerResult {
  secondsLeft: number
  formatted: string
  isWarning: boolean
  isExpired: boolean
}

export function useExamTimer(startTime: Date | null, durationMinutes: number): TimerResult {
  const [secondsLeft, setSecondsLeft] = useState(durationMinutes * 60)

  useEffect(() => {
    if (!startTime) return

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
      const left = Math.max(0, durationMinutes * 60 - elapsed)
      setSecondsLeft(left)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startTime, durationMinutes])

  const h = Math.floor(secondsLeft / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)
  const s = secondsLeft % 60
  const formatted = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return {
    secondsLeft,
    formatted,
    isWarning: secondsLeft <= 300 && secondsLeft > 0, // last 5 min
    isExpired: secondsLeft === 0,
  }
}
