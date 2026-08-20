const canvas = document.querySelector('#nivaCanvas');

function hasModelHit(event) {
  if (!canvas) return false;
  const hitTest = window.NIVA?.hitTest;
  if (typeof hitTest !== 'function') return true;
  try {
    return Boolean(hitTest(event.clientX, event.clientY));
  } catch {
    // Interaction must remain usable even if the guard itself fails.
    return true;
  }
}

function blockTransparent(event) {
  if (event.target !== canvas) return;
  if (hasModelHit(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

document.addEventListener('pointerdown', blockTransparent, true);
document.addEventListener('dblclick', blockTransparent, true);

window.NIVAModelHitGuard = Object.freeze({ hitTest: hasModelHit });
