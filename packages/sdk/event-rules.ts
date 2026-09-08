export type BrowserEventRule = {
  id: string
  kind: 'click' | 'submit' | 'pageview'
  eventName: string
  path: string
  selector?: string
}

// Literal path matching with '*' only. No regex evaluation or query/fragment capture.
export function matchesRulePath(pattern: string, path: string): boolean {
  const clean = path.split(/[?#]/, 1)[0] ?? ''
  const parts = pattern.split('*')
  if (parts.length === 1) return clean === pattern
  if (!clean.startsWith(parts[0] ?? '') || !clean.endsWith(parts[parts.length - 1] ?? ''))
    return false
  let cursor = (parts[0] ?? '').length
  for (const part of parts.slice(1, -1)) {
    const index = clean.indexOf(part, cursor)
    if (index < 0) return false
    cursor = index + part.length
  }
  return cursor <= clean.length - (parts[parts.length - 1] ?? '').length
}

function parseRules(value: unknown): BrowserEventRule[] {
  const config = value as { version?: unknown; rules?: unknown }
  if (!config || config.version !== 1 || !Array.isArray(config.rules) || config.rules.length > 50)
    throw new Error('Invalid event rule configuration')
  const ids = new Set<string>()
  return config.rules.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid event rule')
    const rule = value as BrowserEventRule
    if (
      typeof rule.id !== 'string' ||
      !rule.id ||
      rule.id.length > 128 ||
      ids.has(rule.id) ||
      !['click', 'submit', 'pageview'].includes(rule.kind) ||
      typeof rule.eventName !== 'string' ||
      !rule.eventName.trim() ||
      rule.eventName.length > 100 ||
      typeof rule.path !== 'string' ||
      !rule.path.startsWith('/') ||
      rule.path.length > 512 ||
      /[?#\r\n]/.test(rule.path) ||
      (rule.kind !== 'pageview' &&
        (typeof rule.selector !== 'string' ||
          !rule.selector.trim() ||
          rule.selector.length > 256)) ||
      (rule.kind === 'pageview' && rule.selector !== undefined)
    )
      throw new Error('Invalid event rule')
    ids.add(rule.id)
    return {
      id: rule.id,
      kind: rule.kind,
      eventName: rule.eventName,
      path: rule.path,
      ...(rule.selector ? { selector: rule.selector } : {}),
    }
  })
}

export class BrowserEventRules {
  private rules: BrowserEventRule[] = []
  private controller: AbortController | null = null
  private timer: ReturnType<typeof setInterval>
  private stopped = false
  private freshUntil = 0
  readonly ready: Promise<void>
  constructor(
    private readonly endpoint: string,
    private readonly emit: (rule: BrowserEventRule, path: string) => Promise<void>
  ) {
    document.addEventListener('click', this.interaction, true)
    document.addEventListener('submit', this.interaction, true)
    document.addEventListener('visibilitychange', this.visible)
    this.ready = this.refresh()
    this.timer = setInterval(() => {
      if (!document.hidden) void this.refresh()
    }, 60_000)
  }
  private visible = () => {
    if (!document.hidden) void this.refresh()
  }
  async refresh(): Promise<void> {
    if (this.stopped || this.controller) return
    const controller = new AbortController()
    this.controller = controller
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(this.endpoint, {
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Event rule configuration unavailable')
      // Bound the actual response body, not just the content-length header.
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Missing event rule configuration')
      let bytes = 0
      let json = ''
      const decoder = new TextDecoder()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 524288) throw new Error('Event rule configuration is too large')
          json += decoder.decode(chunk.value, { stream: true })
        }
        json += decoder.decode()
      } finally {
        await reader.cancel()
      }
      const rules = parseRules(JSON.parse(json))
      if (!this.stopped && !controller.signal.aborted) {
        this.rules = rules
        this.freshUntil = Date.now() + 120_000
      }
    } catch {
      this.rules = []
      this.freshUntil = 0
    } finally {
      clearTimeout(timeout)
      if (this.controller === controller) this.controller = null
    }
  }
  private activeRules() {
    return !this.stopped && Date.now() < this.freshUntil ? this.rules : []
  }
  private interaction = (event: Event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null
    if (!target) return
    const path = window.location.pathname
    const names = new Set<string>()
    for (const rule of this.activeRules()) {
      if (
        rule.kind !== event.type ||
        !matchesRulePath(rule.path, path) ||
        names.has(rule.eventName)
      )
        continue
      try {
        // Submit rules match the form itself. Click rules also match nested button contents.
        const matched =
          rule.kind === 'submit'
            ? target.matches(rule.selector ?? '')
            : target.closest(rule.selector ?? '')
        if (!matched) continue
        names.add(rule.eventName)
        void this.emit(rule, path)
      } catch {
        /* An invalid selector never breaks the host page. */
      }
    }
  }
  async pageview(path: string): Promise<void> {
    await this.ready
    const names = new Set<string>()
    for (const rule of this.activeRules()) {
      if (
        this.stopped ||
        rule.kind !== 'pageview' ||
        names.has(rule.eventName) ||
        !matchesRulePath(rule.path, path)
      )
        continue
      names.add(rule.eventName)
      await this.emit(rule, path.split(/[?#]/, 1)[0] ?? '')
    }
  }
  preview() {
    return this.activeRules().map((rule) => {
      try {
        return {
          id: rule.id,
          eventName: rule.eventName,
          matches: !matchesRulePath(rule.path, window.location.pathname)
            ? 0
            : rule.kind === 'pageview'
              ? 1
              : document.querySelectorAll(rule.selector ?? '').length,
          error: null,
        }
      } catch {
        return { id: rule.id, eventName: rule.eventName, matches: 0, error: 'Invalid CSS selector' }
      }
    })
  }
  stop() {
    this.stopped = true
    this.rules = []
    this.controller?.abort()
    clearInterval(this.timer)
    document.removeEventListener('click', this.interaction, true)
    document.removeEventListener('submit', this.interaction, true)
    document.removeEventListener('visibilitychange', this.visible)
  }
}
