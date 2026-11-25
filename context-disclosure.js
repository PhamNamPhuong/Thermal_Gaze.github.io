// Paragraph disclosure (assisted with AI)
(() => {
  const corner = document.querySelector('.corner--context');
  const goal = document.querySelector('.corner--goal');
  const identity = document.querySelector('.corner--identity');
  const academic = document.querySelector('.corner--academic');
  const disclosure = corner.querySelector('.context-disclosure');
  const paragraphWindow = disclosure.querySelector('.context-window');
  const paragraph = disclosure.querySelector('.context');
  const preview = disclosure.querySelector('.context-preview');
  const previewCopy = preview.querySelector('.copy');
  const more = disclosure.querySelector('.context-more');
  const words = paragraph.textContent.trim().split(/\s+/);

  let hovered = false;
  let pinned = false;
  let resizeFrame;

  function updateDisclosure() {
    const expanded = !more.hidden && (hovered || pinned);
    corner.toggleAttribute('data-expanded', expanded);
    disclosure.toggleAttribute('data-expanded', expanded);
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? 'less' : 'more';
    if (expanded || more.hidden) {
      paragraph.removeAttribute('aria-hidden');
      preview.setAttribute('aria-hidden', 'true');
    } else {
      paragraph.setAttribute('aria-hidden', 'true');
      preview.removeAttribute('aria-hidden');
    }
  }

  function closeDisclosure() {
    hovered = false;
    pinned = false;
    updateDisclosure();
  }

  function fullCornerHeight() {
    const surrounding = corner.getBoundingClientRect().height
      - paragraphWindow.getBoundingClientRect().height;
    return surrounding + paragraph.getBoundingClientRect().height;
  }

  function fitCorner(availableHeight, rightEdge) {
    corner.style.removeProperty('--context-width');
    corner.style.removeProperty('--context-scale');
    if (fullCornerHeight() <= availableHeight) return;

    // Make room for the expanded paragraph below the SDG text.
    const initialWidth = corner.getBoundingClientRect().width;
    const availableWidth = rightEdge - academic.getBoundingClientRect().right - 12;
    const widest = Math.max(initialWidth, Math.min(592, availableWidth));
    const setWidth = (width) => corner.style.setProperty('--context-width', `${width}px`);
    setWidth(widest);
    if (fullCornerHeight() <= availableHeight) {
      let low = initialWidth;
      let high = widest;
      while (high - low > 2) {
        const middle = (low + high) / 2;
        setWidth(middle);
        if (fullCornerHeight() <= availableHeight) high = middle;
        else low = middle;
      }
      setWidth(high);
      return;
    }

    let low = Math.min(1, 10 / parseFloat(getComputedStyle(corner).fontSize));
    let high = 1;
    for (let i = 0; i < 7; i++) {
      const middle = (low + high) / 2;
      corner.style.setProperty('--context-scale', middle);
      if (fullCornerHeight() <= availableHeight) low = middle;
      else high = middle;
    }
    corner.style.setProperty('--context-scale', low);
  }

  function fitPreview(maxHeight) {
    let low = 0;
    let high = words.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      previewCopy.textContent = `${words.slice(0, middle).join(' ')}…`;
      if (preview.getBoundingClientRect().height <= maxHeight) low = middle;
      else high = middle - 1;
    }
    previewCopy.textContent = `${words.slice(0, low).join(' ')}…`;
  }

  function measureDisclosure() {
    disclosure.dataset.measuring = '';
    disclosure.dataset.truncated = '';
    preview.hidden = false;

    const anchor = corner.getBoundingClientRect();
    const available = anchor.bottom - goal.getBoundingClientRect().bottom - 12;
    fitCorner(available, anchor.right);

    identity.style.removeProperty('max-inline-size');
    const identityBounds = identity.getBoundingClientRect();
    const identitySpace = corner.getBoundingClientRect().left - identityBounds.left - 8;
    if (anchor.bottom - fullCornerHeight() < identityBounds.bottom && identitySpace < identityBounds.width) {
      identity.style.maxInlineSize = `${Math.max(0, identitySpace)}px`;
    }

    const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
    const expandedHeight = paragraph.getBoundingClientRect().height;
    const otherHeight = fullCornerHeight() - expandedHeight;
    const desiredLines = document.documentElement.clientHeight >= 760 ? 3 : 2;
    const availableLines = Math.floor((available - otherHeight) / lineHeight);
    const lines = Math.max(1, Math.min(desiredLines, availableLines));
    const previewHeight = lines * lineHeight + 0.5;
    const truncated = expandedHeight > previewHeight;
    disclosure.toggleAttribute('data-truncated', truncated);
    preview.hidden = !truncated;
    more.hidden = !truncated;
    if (truncated) fitPreview(previewHeight);

    const closedHeight = (truncated ? preview : paragraph).getBoundingClientRect().height;
    disclosure.style.setProperty('--context-closed', `${closedHeight}px`);
    disclosure.style.setProperty('--context-open', `${expandedHeight}px`);
    updateDisclosure();

    // Apply the measurements before restoring transitions.
    paragraphWindow.getBoundingClientRect();
    delete disclosure.dataset.measuring;
  }

  more.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') {
      hovered = true;
      updateDisclosure();
    }
  });
  corner.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') {
      hovered = false;
      updateDisclosure();
    }
  });
  more.addEventListener('click', () => {
    if (hovered || pinned) closeDisclosure();
    else {
      pinned = true;
      updateDisclosure();
    }
  });
  corner.addEventListener('focusout', (event) => {
    if (!corner.contains(event.relatedTarget)) {
      pinned = false;
      updateDisclosure();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!corner.contains(event.target)) closeDisclosure();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDisclosure();
  });
  window.addEventListener('blur', closeDisclosure);
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(measureDisclosure);
  });

  measureDisclosure();
})();
