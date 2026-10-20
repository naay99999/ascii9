<script lang="ts">
  interface Props {
    label: string
    checked: boolean
    onchange: (v: boolean) => void
  }
  let { label, checked, onchange }: Props = $props()
</script>

<button type="button" class="toggle" role="switch" aria-checked={checked} onclick={() => onchange(!checked)}>
  <span class="text">{label}</span>
  <span class="knob" class:on={checked} aria-hidden="true"></span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    text-align: left;
    border-radius: 6px;
  }
  .toggle:hover .text {
    color: var(--text);
  }
  .knob {
    position: relative;
    flex: none;
    width: 32px;
    height: 18px;
    border-radius: var(--radius-control);
    background: var(--raised);
    transition: background-color 120ms ease;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--muted);
    transition: transform 120ms ease, background-color 120ms ease;
  }
  .knob.on {
    background: var(--text);
  }
  .knob.on::after {
    background: var(--ground);
    transform: translateX(14px);
  }
  @media (max-width: 767px) {
    .toggle {
      min-height: 44px;
      font-size: 14px;
    }
  }
</style>
