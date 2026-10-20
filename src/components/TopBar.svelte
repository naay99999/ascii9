<script lang="ts">
  import DownloadButton, { type Format } from './DownloadButton.svelte'

  interface Props {
    userImage: boolean
    canSave: boolean
    save: (format: Format) => Promise<void>
    /** Phone layout: wordmark and Replace only (Download lives in the dock). */
    mobile?: boolean
    onfile?: (f: File) => void
  }
  let { userImage, canSave, save, mobile = false, onfile }: Props = $props()
  let picker = $state<HTMLInputElement>()
</script>

<header class="bar" class:mobile>
  <h1 class="wm">ascii9</h1>
  {#if mobile}
    <span class="grow"></span>
    <button type="button" class="replace" onclick={() => picker?.click()}>Replace</button>
    <input
      bind:this={picker}
      type="file"
      accept="image/*"
      hidden
      onchange={(e) => {
        const f = e.currentTarget.files?.[0]
        e.currentTarget.value = ''
        if (f) onfile?.(f)
      }}
    />
  {:else}
    <p class="hint">{userImage ? 'Drop or paste to replace' : 'Drop or paste your own image to replace the sample'}</p>
    <DownloadButton {save} disabled={!canSave} />
  {/if}
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 48px;
    padding: 0 6px;
    min-width: 0;
  }
  .wm {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .hint {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--faint);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .grow {
    flex: 1;
  }
  .bar.mobile {
    height: 56px;
    padding: 0 var(--pad);
  }
  .replace {
    height: 44px;
    padding: 0 20px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }
</style>
