<script lang="ts">
  import { SAMPLES } from '../lib/samples'

  interface Props {
    /** id of the sample on stage, or null when the user's own image is shown */
    selected: string | null
    onsample: (id: string) => void
    onfile: (f: File) => void
  }
  let { selected, onsample, onfile }: Props = $props()
  let picker: HTMLInputElement
</script>

<div class="strip">
  <div class="thumbs" role="group" aria-label="Samples">
    {#each SAMPLES as s (s.id)}
      <button type="button" class="thumb" class:on={s.id === selected} aria-pressed={s.id === selected} aria-label="Sample: {s.label}" onclick={() => onsample(s.id)}>
        <img src={s.src} alt="" width="36" height="36" loading="lazy" decoding="async" />
      </button>
    {/each}
  </div>
  <span class="sep" aria-hidden="true">·</span>
  <button type="button" class="choose" onclick={() => picker.click()}>Choose your image</button>
  <input
    bind:this={picker}
    type="file"
    accept="image/*"
    hidden
    onchange={(e) => {
      const f = e.currentTarget.files?.[0]
      e.currentTarget.value = ''
      if (f) onfile(f)
    }}
  />
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .thumbs {
    display: flex;
    gap: 8px;
  }
  .thumb {
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--raised);
    opacity: 0.7;
    transition: opacity 120ms ease;
  }
  .thumb:hover,
  .thumb.on {
    opacity: 1;
  }
  .thumb.on {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .thumb:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 4px;
  }
  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .sep {
    color: var(--faint);
  }
  .choose {
    height: 32px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--faint);
    border-radius: 6px;
  }
  .choose:hover {
    color: var(--text);
  }
</style>
