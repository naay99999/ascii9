<script lang="ts">
  import DownloadButton, { type Format } from './DownloadButton.svelte'

  interface Props {
    userImage: boolean
    canSave: boolean
    save: (format: Format) => Promise<void>
  }
  let { userImage, canSave, save }: Props = $props()
</script>

<header class="bar">
  <h1 class="wm">ascii9</h1>
  <p class="hint">{userImage ? 'Drop or paste to replace' : 'Drop or paste your own image to replace the sample'}</p>
  <DownloadButton {save} disabled={!canSave} />
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
</style>
