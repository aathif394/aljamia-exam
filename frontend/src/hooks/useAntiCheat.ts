import { useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'

export type CheatEvent =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'devtools_open'
  | 'right_click'
  | 'copy_attempt'
  | 'keyboard_shortcut'
  | 'split_screen'

interface Options {
  enabled: boolean
  onStrike: (count: number, status: string, event: CheatEvent) => void
  onFullscreenLost: () => void
}

export function useAntiCheat({ enabled, onStrike, onFullscreenLost }: Options) {
  const reportingRef = useRef(false)

  const reportStrike = useCallback(
    async (event: CheatEvent) => {
      if (!enabled || reportingRef.current) return
      reportingRef.current = true
      try {
        const res = await api.student.strike(event)
        onStrike(res.strikes, res.status, event)
      } catch {}
      finally {
        // Short cooldown to prevent double-counting one exit event (e.g. blur + visibilitychange
        // both firing at the same time), but short enough that a second deliberate exit is counted.
        setTimeout(() => { reportingRef.current = false }, 500)
      }
    },
    [enabled, onStrike],
  )

  // ── Fullscreen enforcement ───────────────────────────────────────────────
  const requestFullscreen = useCallback(() => {
    const el = document.documentElement as HTMLElement & {
      mozRequestFullScreen?: () => Promise<void>
      webkitRequestFullscreen?: () => Promise<void>
    }
    const req = el.requestFullscreen || el.mozRequestFullScreen || el.webkitRequestFullscreen
    if (req) req.call(el).catch(() => {})
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onFsChange = () => {
      const fs = document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
      if (!fs) {
        onFullscreenLost()
        reportStrike('fullscreen_exit')
      }
    }

    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [enabled, reportStrike, onFullscreenLost])

  // ── Tab visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') reportStrike('tab_switch')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, reportStrike])

  // ── Window blur ──────────────────────────────────────────────────────────
  useEffect(() => {
  if (!enabled) return;
    const onBlur = () => {
      // Small delay to allow for momentary UI shifts (like keyboard appearance)
      // or internal browser focus changes.
      setTimeout(() => {
        if (!document.hasFocus() && document.visibilityState === 'visible') {
          // Additional check: only report blur if the tab is still visible
          // (visibilitychange handles truly switching tabs)
          reportStrike('window_blur');
        }
      }, 250);
    };
  window.addEventListener('blur', onBlur);
  return () => window.removeEventListener('blur', onBlur);
}, [enabled, reportStrike]);

  // ── Keyboard shortcuts block ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const blocked = [
        e.key === 'F12',
        e.ctrlKey && ['t', 'w', 'n', 'Tab', 'u', 'p'].includes(e.key.toLowerCase()),
        e.altKey && e.key === 'Tab',
        e.metaKey && ['t', 'w', 'n'].includes(e.key.toLowerCase()),
      ]
      if (blocked.some(Boolean)) {
        e.preventDefault()
        e.stopPropagation()
        reportStrike('keyboard_shortcut')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enabled, reportStrike])

  // ── Right-click disable ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const onCtxMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', onCtxMenu)
    return () => document.removeEventListener('contextmenu', onCtxMenu)
  }, [enabled])

  // ── Copy / cut disable ───────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const block = (e: ClipboardEvent) => {
      // Allow copy inside textarea/input (descriptive answers)
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      e.preventDefault()
    }
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    return () => {
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
    }
  }, [enabled])

  // ── DevTools detection (size heuristic) ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    let reported = false
    const check = () => {
      const threshold = 160
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!reported) {
          reported = true
          reportStrike('devtools_open')
        }
      } else {
        reported = false
      }
    }
    const interval = setInterval(check, 3000)
    return () => clearInterval(interval)
  }, [enabled, reportStrike])

  // ── Split-screen detection (mobile Android multi-window) ─────────────────
  useEffect(() => {
    if (!enabled) return
    const initialH = window.innerHeight
    const initialW = window.innerWidth
    let reported = false
    const onResize = () => {
      const shrinkH = (initialH - window.innerHeight) / initialH
      const shrinkW = (initialW - window.innerWidth) / initialW
      if (shrinkH > 0.25 || shrinkW > 0.25) {
        if (!reported) {
          reported = true
          reportStrike('split_screen')
        }
      } else {
        reported = false
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, reportStrike])

  // ── Text selection clearing (prevents long-press copy on mobile) ──────────
  useEffect(() => {
  if (!enabled) return;
  const clearSel = (e: Event) => {
    // If the user is interacting with an input, do absolutely nothing
    if (
      document.activeElement instanceof HTMLTextAreaElement || 
      document.activeElement instanceof HTMLInputElement ||
      (e.target instanceof HTMLElement && e.target.closest('textarea, input'))
    ) {
      return;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      sel.removeAllRanges();
    }
  };
  // Use mouseup/touchend instead of selectionchange for better Chrome stability
  document.addEventListener('mouseup', clearSel);
  document.addEventListener('touchend', clearSel);
  return () => {
    document.removeEventListener('mouseup', clearSel);
    document.removeEventListener('touchend', clearSel);
  };
}, [enabled]);

  // ── Paste blocking (outside answer inputs) ────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    const block = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      e.preventDefault()
    }
    document.addEventListener('paste', block)
    return () => document.removeEventListener('paste', block)
  }, [enabled])

  return { requestFullscreen }
}
