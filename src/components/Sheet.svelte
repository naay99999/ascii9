<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    open: boolean
    /** Accessible name and visible heading. */
    label: string
    doneLabel?: string
    children: Snippet
  }
  let { open = $bindable(false), label, doneLabel = 'Done', children }: Props = $props()

  let dlg = $state<HTMLDialogElement>()
  let opener: HTMLElement | null = null
  const titleId = $props.id()

  // The native <dialog> gives us the focus trap, Esc handling and an inert page behind it.
  $effect(() => {
    if (!dlg) return
    if (open && !dlg.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dlg.showModal()
    } else if (!open && dlg.open) {
      dlg.close()
    }
  })

  // Keep the page from scrolling behind the sheet; always undone, even if the sheet unmounts open.
  $effect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  })

  function onclose() {
    open = false
    opener?.focus()
    opener = null
  }

  // Close on a backdrop click only when the press also started on the backdrop: a drag (e.g. text
  // selection or a slider) that starts inside the sheet and is released outside must not close it.
  let downOnBackdrop = false
  function onpointerdown(e: PointerEvent) {
    downOnBackdrop = e.target === dlg
  }
  function onbackdrop(e: MouseEvent) {
    if (e.target === dlg && downOnBackdrop) open = false
    downOnBackdrop = false
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dlg} aria-labelledby={titleId} {onclose} {onpointerdown} onclick={onbackdrop}>
  <div class="sheet">
    <header>
      <h2 id={titleId}>{label}</h2>
      <button type="button" class="done" onclick={() => (open = false)}>{doneLabel}</button>
    </header>
    <div class="body">
      {@render children()}
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: 100%;
    max-width: 100%;
    max-height: 85vh;
    max-height: 85dvh;
    margin: auto 0 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    background: var(--surface);
    color: var(--text);
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  .sheet {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px 8px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .done {
    min-width: 72px;
    height: 44px;
    padding: 0 20px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
  }
</style>
