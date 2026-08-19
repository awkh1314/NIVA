const canvas = document.querySelector('#nivaCanvas');

function hasRenderedPixel(event) {
  if (!canvas) return false;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return true;
  const rect = canvas.getBoundingClientRect();
  const sx = gl.drawingBufferWidth / Math.max(1, rect.width);
  const sy = gl.drawingBufferHeight / Math.max(1, rect.height);
  const cx = Math.round((event.clientX - rect.left) * sx);
  const cy = Math.round((rect.bottom - event.clientY) * sy);
  const pixel = new Uint8Array(4);
  try {
    for (let oy = -2; oy <= 2; oy += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        const x = Math.max(0, Math.min(gl.drawingBufferWidth - 1, cx + ox));
        const y = Math.max(0, Math.min(gl.drawingBufferHeight - 1, cy + oy));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel[3] > 18) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function blockTransparent(event) {
  if (event.target !== canvas) return;
  if (hasRenderedPixel(event)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

document.addEventListener('pointerdown', blockTransparent, true);
document.addEventListener('dblclick', blockTransparent, true);

window.NIVAModelHitGuard = Object.freeze({ hitTest: hasRenderedPixel });
