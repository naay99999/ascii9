<script lang="ts" generics="T extends string">
  interface Props {
    label: string
    options: readonly { value: T; label: string }[]
    value: T
    onchange: (v: T) => void
  }
  let { label, options, value, onchange }: Props = $props()
</script>

<div class="seg" role="group" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" class:on={o.value === value} aria-pressed={o.value === value} onclick={() => onchange(o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-control);
    background: var(--raised);
  }
  button {
    flex: 1;
    height: 26px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    transition: background-color 120ms ease, color 120ms ease;
  }
  button:hover:not(.on) {
    color: var(--text);
  }
  button.on {
    background: var(--text);
    color: var(--ground);
  }
  @media (max-width: 767px) {
    .seg {
      padding: 2px;
    }
    button {
      height: 44px;
      font-size: 14px;
    }
  }
</style>
