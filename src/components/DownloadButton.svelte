<script lang="ts" module>
  export type Format = 'png' | 'jpg' | 'txt'
</script>

<script lang="ts">
  interface Props {
    /** Saves the current art in the given format. Resolves once the download was handed to the browser. */
    save: (format: Format) => Promise<void>
    disabled?: boolean
  }
  let { save, disabled = false }: Props = $props()

  const FORMATS: { value: Format; label: string }[] = [
    { value: 'png', label: 'PNG' },
    { value: 'jpg', label: 'JPG' },
    { value: 'txt', label: 'TXT' },
  ]

  let format = $state<Format>('png')
  let open = $state(false)
  let saving = $state(false)
  let saved = $state(false)
  let failed = $state(false)
  let savedTimer: ReturnType<typeof setTimeout> | undefined
  let root: HTMLDivElement
  let caret: HTMLButtonElement
  let menu = $state<HTMLDivElement>()
  const menuId = $props.id()

  const label = $derived(FORMATS.find((f) => f.value === format)!.label)

  async function download() {
    if (saving || disabled) return
    saving = true
    failed = false
    try {
      await save(format)
      saved = true
      clearTimeout(savedTimer)
      savedTimer = setTimeout(() => (saved = false), 2000)
    } catch {
      failed = true
      saved = false
      clearTimeout(savedTimer)
      savedTimer = setTimeout(() => (failed = false), 4000)
    } finally {
      saving = false
    }
  }

  function items(): HTMLElement[] {
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : []
  }

  async function openMenu() {
    open = true
    await Promise.resolve()
    requestAnimationFrame(() => {
      const list = items()
      ;(list.find((el) => el.getAttribute('aria-checked') === 'true') ?? list[0])?.focus()
    })
  }

  function closeMenu(refocus = true) {
    open = false
    if (refocus) caret?.focus()
  }

  function choose(f: Format, e: MouseEvent) {
    format = f
    // Return focus to the caret only for keyboard activation (a pointer click has detail > 0).
    closeMenu(e.detail === 0)
  }

  function onMenuKey(e: KeyboardEvent) {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(i + 1) % list.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i - 1 + list.length) % list.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      list[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      list[list.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
    } else if (e.key === 'Tab') {
      closeMenu(false)
    }
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) closeMenu(false)
  }
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="dl" bind:this={root}>
  <span class="status" role="status">{saved ? 'Saved' : failed ? "Couldn't save" : ''}</span>
  <div class="pill">
    <button type="button" class="main" onclick={download} disabled={disabled || saving}>Download {label}</button>
    <button
      type="button"
      class="caret"
      bind:this={caret}
      aria-label="Choose download format"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onclick={() => (open ? closeMenu() : openMenu())}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  </div>
  {#if open}
    <div class="menu" id={menuId} role="menu" aria-label="Download format" tabindex="-1" bind:this={menu} onkeydown={onMenuKey}>
      {#each FORMATS as f (f.value)}
        <button type="button" role="menuitemradio" aria-checked={f.value === format} tabindex="-1" onclick={(e) => choose(f.value, e)}>
          {f.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dl {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .status {
    font-size: 13px;
    color: var(--muted);
    min-width: 0;
  }
  /* Two white halves split by a 2px gap of ground: one white, no second near-white tone. */
  .pill {
    display: flex;
    gap: 2px;
    height: 32px;
  }
  .pill button {
    border: 0;
    background: var(--text);
    color: var(--ground);
    font-weight: 500;
    font-size: 13px;
  }
  .main {
    padding: 0 12px 0 16px;
    border-radius: var(--radius-control) 0 0 var(--radius-control);
    font-variant-numeric: tabular-nums;
  }
  .pill .caret {
    display: grid;
    place-items: center;
    width: 32px;
    padding: 0 4px 0 0;
    border-radius: 0 var(--radius-control) var(--radius-control) 0;
  }
  .main:disabled {
    cursor: progress;
  }
  .pill button:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    padding: 4px;
    border-radius: 12px;
    background: var(--raised);
  }
  .menu button {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    text-align: left;
    font-size: 13px;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--raised-hover);
    color: var(--text);
    outline: none;
  }
  .menu button[aria-checked='true'] {
    color: var(--text);
  }
  .menu button[aria-checked='true']::after {
    content: '';
    float: right;
    width: 6px;
    height: 6px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--text);
  }
</style>
