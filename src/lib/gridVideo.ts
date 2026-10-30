/*
  The grids' video tiles (portfolio.astro, THE VIDEO WORK ON THE GRIDS TOO):
  opened, a video tile shows its still with a play button on the picture's
  middle; the button plays it over the picture. The tile closes as any tile
  does - a click on it off the button, or on its margin and label once it
  is playing - and closing stops it. The same as the All view (LandsView,
  play()), whose rule Chris set: "don't autoplay on open, let it have one
  more click before playing".
*/

const over = (el: HTMLElement, img: HTMLElement, size: boolean) => {
  // Kept on the picture as the tile grows and the grid moves.
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) return ro.disconnect();
    if (size) {
      el.style.left = `${img.offsetLeft}px`;
      el.style.top = `${img.offsetTop}px`;
      el.style.width = `${img.offsetWidth}px`;
      el.style.height = `${img.offsetHeight}px`;
    } else {
      el.style.left = `${img.offsetLeft + img.offsetWidth / 2}px`;
      el.style.top = `${img.offsetTop + img.offsetHeight / 2}px`;
    }
  });
  ro.observe(img);
};

const play = (item: HTMLElement, img: HTMLElement) => {
  item.querySelector('.wd-go-play')?.remove();
  if (item.querySelector('.pf-player')) return;
  const player = document.createElement('div');
  player.className = 'pf-player';
  const title = img.getAttribute('alt') || 'Video';
  const src = item.dataset.video!;
  if (item.dataset.videoKind === 'file') {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('aria-label', title);
    player.append(video);
  } else {
    const frame = document.createElement('iframe');
    frame.src = `${src}${src.includes('?') ? '&' : '?'}autoplay=1&rel=0&playsinline=1`;
    frame.title = title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    player.append(frame);
  }
  item.append(player);
  over(player, img, true);
};

export function startGridVideo(grid: HTMLElement) {
  const sync = () => {
    grid.querySelectorAll<HTMLElement>('.pf-item[data-video]').forEach((item) => {
      const open = item.classList.contains('is-expanded');
      if (!open) {
        // Closed: whatever was playing stops.
        item.querySelectorAll('.pf-player, .wd-go-play').forEach((el) => el.remove());
        return;
      }
      if (item.querySelector('.pf-player, .wd-go-play')) return;
      const img = item.querySelector<HTMLElement>('.pf-item__img');
      if (!img) return;
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'wd-go-play';
      go.setAttribute('aria-label', `Play ${img.getAttribute('alt') || 'the video'}`);
      go.addEventListener('click', (e) => {
        // Play, not a click on the tile: it stays open.
        e.stopPropagation();
        play(item, img);
      });
      item.append(go);
      over(go, img, false);
    });
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  }).observe(grid, {subtree: true, attributes: true, attributeFilter: ['class']});
}
