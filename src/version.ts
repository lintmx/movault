import { useCallback, useEffect, useRef, useState } from 'react'

type AppVersion = { id: string; label: string; commit: string; builtAt: string }
declare const __APP_VERSION__: AppVersion
export const currentVersion = __APP_VERSION__

async function readVersion() {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('updates.versionFailed')
  const version = await response.json() as AppVersion
  if (!version || typeof version.id !== 'string' || !version.id ||
    typeof version.label !== 'string' || !version.label ||
    typeof version.commit !== 'string' || typeof version.builtAt !== 'string' ||
    !Number.isFinite(Date.parse(version.builtAt))) throw new Error('updates.invalidVersion')
  return version
}

export function useAppVersion() {
  const [latest, setLatest] = useState<AppVersion | null>(null)
  const [status, setStatus] = useState<'idle' | 'checking' | 'latest' | 'available' | 'error'>('idle')
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const checking = useRef(false)
  const lastAttempt = useRef(0)
  const check = useCallback(async (manual = false) => {
    if (import.meta.env.DEV || checking.current || (!manual && Date.now() - lastAttempt.current < 60000)) return
    checking.current = true
    lastAttempt.current = Date.now()
    setStatus('checking')
    try {
      const version = await readVersion()
      setLatest(version)
      setStatus(version.id === currentVersion.id ? 'latest' : 'available')
      setCheckedAt(new Date())
    } catch {
      setStatus('error')
    } finally {
      checking.current = false
    }
  }, [])

  useEffect(() => {
    const restore = () => { if (document.visibilityState === 'visible') void check() }
    const online = () => { void check(true) }
    const offline = () => setStatus('error')
    const timer = window.setTimeout(() => void check(), 0)
    document.addEventListener('visibilitychange', restore)
    window.addEventListener('pageshow', restore)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', restore)
      window.removeEventListener('pageshow', restore)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [check])

  return { latest, status, checkedAt, check }
}

export async function applyUpdate(signal: AbortSignal) {
  const latest = await readVersion()
  signal.throwIfAborted()
  if (latest.id === currentVersion.id) throw new Error('updates.alreadyLatest')
  if (!('serviceWorker' in navigator)) {
    window.location.reload()
    return
  }
  let timer = 0
  let channel: MessageChannel | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('updates.timeout')), 60000)
  })
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }), deadline,
    ])
    await Promise.race([registration.update(), deadline])
    while (registration.installing) {
      signal.throwIfAborted()
      await Promise.race([new Promise(resolve => window.setTimeout(resolve, 100)), deadline])
    }
    signal.throwIfAborted()
    const worker = registration.waiting ?? registration.active
    if (!worker) throw new Error('updates.resourcesFailed')
    channel = new MessageChannel()
    const reply = new Promise<{ error: string; errorKey?: string }>(resolve => {
      channel!.port1.onmessage = event => resolve(event.data)
    })
    worker.postMessage({ type: 'activate-update', buildId: latest.id }, [channel.port2])
    const result = await Promise.race([reply, deadline])
    if (result.error) throw new Error(result.errorKey ?? result.error)
    while (navigator.serviceWorker.controller !== worker || worker.state !== 'activated') {
      signal.throwIfAborted()
      await Promise.race([new Promise(resolve => window.setTimeout(resolve, 100)), deadline])
    }
    signal.throwIfAborted()
    window.location.reload()
  } finally {
    window.clearTimeout(timer)
    channel?.port1.close()
    channel?.port2.close()
  }
}
