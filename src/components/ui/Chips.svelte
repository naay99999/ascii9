<script lang="ts" generics="T extends string">
  interface Option {
    value: T
    label: string
  }
  interface Props {
    label: string
    options: readonly Option[]
    /** null = none of the options is selected */
    value: T | null
    onchange: (v: T) => void
    /** A non-clickable chip shown selected after the options (e.g. "Custom"). */
    extra?: string | null
    /** One non-wrapping row that scrolls sideways inside itself (the mobile dock). */
    scroll?: boolean
  }
  let { label, options, value, onchange, extra = null, scroll = false }: Props = $props()
</script>

<div class="chips" class:scroll role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" class="chip" class:on={o.value === value} aria-pressed={o.value === value} onclick={() => onchange(o.value)}>
      {o.label}
    </button>
  {/each}
  {#if extra}
    <span class="chip on static" aria-current="true">{extra}</span>
  {/if}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--muted);
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    transition: background-color 120ms ease, color 120ms ease;
  }
  button.chip:hover:not(.on) {
    color: var(--text);
  }
  .chip.on {
    background: var(--text);
    color: var(--ground);
  }
  .static {
    cursor: default;
  }
  .scroll {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    margin-inline: calc(-1 * var(--pad));
    padding-inline: var(--pad);
    /* overflow-x also clips vertically: leave room for the 2px + 2px focus ring. */
    margin-block: -4px;
    padding-block: 4px;
  }
  .scroll::-webkit-scrollbar {
    display: none;
  }
  .scroll .chip {
    flex: none;
  }
  @media (max-width: 767px) {
    .chip {
      height: 44px;
      padding: 0 16px;
      font-size: 14px;
    }
    .chips {
      gap: 8px;
    }
  }
</style>
