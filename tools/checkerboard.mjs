function gridAxis(edges) {
  const votes = edges.reduce((sum, value) => sum + value, 0);
  if (votes < 40) return null;
  let best;
  for (let size = 5; size <= 28; size += 0.25) {
    for (let phase = 0; phase < size; phase += 0.5) {
      let score = 0;
      for (let position = 3; position < edges.length - 3; position++) {
        const interval = (position - phase) / size;
        const offset = Math.abs(interval - Math.round(interval)) * size;
        score += edges[position] * Math.max(0, 1 - offset / 2);
      }
      const confidence = (score / votes - 2 / size) / (1 - 2 / size);
      if (!best || confidence > best.confidence) best = {size, phase, confidence};
    }
  }
  return best.confidence >= 0.26 ? best : null;
}

export function removeCheckerboard(pixels, width, height) {
  const count = width * height;
  const luma = new Float32Array(count);
  const neutral = new Uint8Array(count);
  const edgeX = new Float32Array(width);
  const edgeY = new Float32Array(height);
  for (let i = 0; i < count; i++) {
    const [r, g, b, alpha] = pixels.subarray(i * 4, i * 4 + 4);
    luma[i] = (r + g + b) / 3;
    neutral[i] = alpha > 235 && Math.max(r, g, b) - Math.min(r, g, b) <= 15 && luma[i] >= 150;
  }
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      const i = y * width + x;
      if (!neutral[i]) continue;
      if (neutral[i - 1] && Math.abs(luma[i] - luma[i - 1]) > 19) edgeX[x]++;
      if (neutral[i - width] && Math.abs(luma[i] - luma[i - width]) > 19) edgeY[y]++;
    }
  }

  const columns = gridAxis(edgeX);
  const rows = gridAxis(edgeY);
  if (!columns || !rows || Math.abs(columns.size - rows.size) > 2) return false;

  const cell = (position, axis) => Math.floor((position + 0.5 - axis.phase) / axis.size);
  const parityAt = (x, y) => (cell(x, columns) + cell(y, rows)) & 1;
  const histograms = [new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < count; i++) {
    if (neutral[i]) histograms[parityAt(i % width, Math.floor(i / width))][Math.round(luma[i])]++;
  }
  const colors = histograms.map(histogram => histogram.reduce((mode, val, index) => val > histogram[mode] ? index : mode, 0));
  if (Math.min(...colors) < 160 || Math.abs(colors[0] - colors[1]) < 25) return false;

  const source = pixels.slice();
  const candidates = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const parity = parityAt(x, y);
    const nearX = parity !== parityAt(x - 1, y) || parity !== parityAt(x + 1, y);
    const nearY = parity !== parityAt(x, y - 1) || parity !== parityAt(x, y + 1);
    const intermediate = luma[i] >= Math.min(...colors) - 8 && luma[i] <= Math.max(...colors) + 6;
    if (neutral[i] && (Math.abs(luma[i] - colors[parity]) < 13 || ((nearX || nearY) && intermediate))) {
      candidates[i] = 1;
    }
  }

  const queue = new Int32Array(count);
  let removed = 0;
  for (let start = 0; start < count; start++) {
    if (!candidates[start]) continue;
    let head = 0;
    let tail = 1;
    const matches = [0, 0];
    let edge = false;
    candidates[start] = 0;
    queue[0] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const y = Math.floor(i / width);
      const parity = parityAt(x, y);
      if (Math.abs(luma[i] - colors[parity]) < 10) matches[parity]++;
      edge ||= x < 12 || y < 12 || x >= width - 12 || y >= height - 12;
      const neighbors = [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width];
      for (const neighbor of neighbors) {
        if (!candidates[neighbor]) continue;
        candidates[neighbor] = 0;
        queue[tail++] = neighbor;
      }
    }
    if (tail < 12 || Math.min(...matches) < tail * (edge ? 0.09 : 0.30) || (!edge && tail < 600)) continue;
    for (let j = 0; j < tail; j++) pixels[4 * queue[j] + 3] = 0;
    removed += tail;
  }
  if (removed < count * 0.05 || removed > count * 0.93) return false;

  for (let i = 0; i < count; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < 12 || y < 12 || x >= width - 12 || y >= height - 12) {
      const [r, g, b, alpha] = pixels.subarray(i * 4, i * 4 + 4);
      if (alpha < 235 || (luma[i] > 110 && Math.max(r, g, b) - Math.min(r, g, b) < 35)) pixels[4 * i + 3] = 0;
    }
  }

  // The PDF crop can leave thin, straight lines around the art.
  for (const vertical of [true, false]) {
    const depth = vertical ? width : height;
    const span = vertical ? height : width;
    for (const farEdge of [false, true]) {
      let frame = -1;
      for (let offset = 0; offset < Math.floor(depth * 0.20); offset++) {
        const line = farEdge ? depth - 1 - offset : offset;
        let pale = 0;
        for (let point = 0; point < span; point++) {
          const i = vertical ? point * width + line : line * width + point;
          const [r, g, b, alpha] = pixels.subarray(i * 4, i * 4 + 4);
          if (alpha > 10 && luma[i] > 85 && Math.max(r, g, b) - Math.min(r, g, b) < 38) pale++;
        }
        if (pale > span * 0.62) frame = offset;
      }
      for (let offset = 0; offset <= frame; offset++) {
        const line = farEdge ? depth - 1 - offset : offset;
        for (let point = 0; point < span; point++) {
          const i = vertical ? point * width + line : line * width + point;
          pixels[4 * i + 3] = 0;
        }
      }
    }
  }

  // Keep the sprite and remove disconnected flecks left by JPEG and page cropping.
  const components = [];
  const visited = new Uint8Array(count);
  for (let start = 0; start < count; start++) {
    if (visited[start] || !pixels[4 * start + 3]) continue;
    const component = [start];
    visited[start] = 1;
    for (let head = 0; head < component.length; head++) {
      const i = component[head];
      const x = i % width;
      for (const neighbor of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
        if (visited[neighbor] || !pixels[4 * neighbor + 3]) continue;
        visited[neighbor] = 1;
        component.push(neighbor);
      }
    }
    components.push(component);
  }
  const largest = components.reduce((max, component) => Math.max(max, component.length), 0);
  for (const component of components) {
    if (component.length >= largest * 0.025) continue;
    for (const i of component) pixels[4 * i + 3] = 0;
  }

  // Fill small enclosed gaps where a pale part of the sprite matched one of the squares.
  visited.fill(0);
  for (let start = 0; start < count; start++) {
    if (visited[start] || pixels[4 * start + 3]) continue;
    const component = [start];
    visited[start] = 1;
    let outside = false;
    for (let head = 0; head < component.length; head++) {
      const i = component[head];
      const x = i % width;
      outside ||= x === 0 || x === width - 1 || i < width || i >= count - width;
      for (const neighbor of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
        if (neighbor < 0 || neighbor >= count || visited[neighbor] || pixels[4 * neighbor + 3]) continue;
        visited[neighbor] = 1;
        component.push(neighbor);
      }
    }
    if (outside || component.length > columns.size * rows.size * 2.5) continue;
    for (const i of component) pixels[4 * i + 3] = source[4 * i + 3];
  }
  return true;
}
