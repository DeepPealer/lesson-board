/**
 * =========================================================
 * MiroSQL Studio - Infinite Canvas & Coordinate Transform Engine
 * =========================================================
 */

const Canvas = (() => {
  let scale = 1;
  let panX = 80;
  let panY = 100;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;

  let containerEl = null;
  let worldLayerEl = null;
  let drawingSvgEl = null;
  let drawingGroupEl = null;

  // Drawing strokes: array of { id, color, size, points: [{x, y}] }
  let strokes = [];
  let currentStroke = null;

  function init(containerId, worldLayerId, drawingSvgId, drawingGroupId) {
    containerEl = document.getElementById(containerId);
    worldLayerEl = document.getElementById(worldLayerId);
    drawingSvgEl = document.getElementById(drawingSvgId);
    drawingGroupEl = document.getElementById(drawingGroupId);

    setupEvents();
    updateTransform();
  }

  // Coordinate Transforms
  function screenToWorld(clientX, clientY) {
    const rect = containerEl.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return {
      x: (localX - panX) / scale,
      y: (localY - panY) / scale
    };
  }

  function worldToScreen(worldX, worldY) {
    const rect = containerEl.getBoundingClientRect();
    const localX = worldX * scale + panX;
    const localY = worldY * scale + panY;
    return {
      x: localX + rect.left,
      y: localY + rect.top
    };
  }

  function updateTransform() {
    if (!worldLayerEl || !drawingGroupEl) return;

    worldLayerEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    drawingGroupEl.setAttribute('transform', `translate(${panX}, ${panY}) scale(${scale})`);

    const erdGroup = document.getElementById('erd-connectors-group');
    if (erdGroup) {
      erdGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${scale})`);
    }

    // Parallax Dot Grid
    containerEl.style.backgroundPosition = `${panX}px ${panY}px`;
    containerEl.style.backgroundSize = `${24 * scale}px ${24 * scale}px`;

    const zoomText = document.getElementById('btn-zoom-reset');
    if (zoomText) zoomText.textContent = `${Math.round(scale * 100)}%`;

    if (window.Collab) {
      Collab.broadcastViewport(scale, panX, panY);
      if (Collab.onCanvasTransform) Collab.onCanvasTransform();
    }
  }

  function setupEvents() {
    // Wheel zoom towards mouse pointer
    containerEl.addEventListener('wheel', (e) => {
      if (e.target.closest('.overflow-auto') || e.target.closest('.overflow-y-auto') || e.target.closest('textarea')) {
        return;
      }
      e.preventDefault();

      const rect = containerEl.getBoundingClientRect();
      const mouseLocalX = e.clientX - rect.left;
      const mouseLocalY = e.clientY - rect.top;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      let newScale = scale * zoomFactor;
      newScale = Math.max(0.15, Math.min(newScale, 3.5));

      panX = mouseLocalX - worldPos.x * newScale;
      panY = mouseLocalY - worldPos.y * newScale;
      scale = newScale;

      updateTransform();
      saveToStorage();
    }, { passive: false });

    // Spacebar to pan temporarily
    let isSpaceDown = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['TEXTAREA', 'INPUT'].includes(e.target.tagName)) {
        isSpaceDown = true;
        containerEl.style.cursor = 'grab';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isSpaceDown = false;
        containerEl.style.cursor = Tools.getActiveTool() === 'hand' ? 'grab' : 'default';
      }
    });

    // Panning & Drawing pointer events
    containerEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.board-item') && Tools.getActiveTool() === 'select') {
        return;
      }

      if (e.button === 1 || Tools.getActiveTool() === 'hand' || isSpaceDown) {
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        containerEl.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;

      const worldPos = screenToWorld(e.clientX, e.clientY);
      const tool = Tools.getActiveTool();

      if (tool === 'brush') {
        if (window.History) History.capture();
        currentStroke = {
          id: 'stroke_' + Date.now(),
          color: Tools.getBrushColor(),
          size: Tools.getBrushSize(),
          points: [worldPos]
        };
        renderStrokes();
      } else if (tool === 'eraser') {
        if (window.History) History.capture();
        eraseAt(worldPos);
      } else if (tool === 'sticky') {
        if (window.History) History.capture();
        Widgets.createSticky(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'sql') {
        if (window.History) History.capture();
        Widgets.createSqlWidget(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'image') {
        Widgets.triggerImageUpload(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'assignment') {
        if (window.History) History.capture();
        Widgets.createAssignmentWidget(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'quiz') {
        if (window.History) History.capture();
        Widgets.createQuizWidget(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'sql_builder') {
        if (window.History) History.capture();
        Widgets.createSqlBuilderWidget(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'checklist') {
        if (window.History) History.capture();
        Widgets.createChecklistWidget(worldPos.x, worldPos.y);
        Tools.setTool('select');
      } else if (tool === 'select') {
        Widgets.deselectAll();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (isPanning) {
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        updateTransform();
        return;
      }

      const worldPos = screenToWorld(e.clientX, e.clientY);
      const tool = Tools.getActiveTool();

      if (tool === 'brush' && currentStroke) {
        currentStroke.points.push(worldPos);
        renderStrokes();
      } else if (tool === 'eraser' && (e.buttons === 1)) {
        eraseAt(worldPos);
      }
    });

    window.addEventListener('pointerup', () => {
      if (isPanning) {
        isPanning = false;
        containerEl.style.cursor = Tools.getActiveTool() === 'hand' || isSpaceDown ? 'grab' : 'default';
        saveToStorage();
      }

      if (currentStroke) {
        if (currentStroke.points.length > 1) {
          strokes.push(currentStroke);
          saveToStorage();
          if (window.Collab) Collab.broadcastStroke(currentStroke);
        }
        currentStroke = null;
      }
    });
  }

  // SVG Strokes rendering
  function pointsToSvgPath(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }

  function renderStrokes() {
    if (!drawingGroupEl) return;
    drawingGroupEl.innerHTML = '';
    const all = [...strokes];
    if (currentStroke) all.push(currentStroke);

    all.forEach(stroke => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pointsToSvgPath(stroke.points));
      path.setAttribute('stroke', stroke.color);
      path.setAttribute('stroke-width', stroke.size);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', 'none');
      drawingGroupEl.appendChild(path);
    });
  }

  function eraseAt(worldPos) {
    const radius = 22 / scale;
    let removed = false;
    strokes = strokes.filter(s => {
      const hit = s.points.some(p => {
        const dx = p.x - worldPos.x;
        const dy = p.y - worldPos.y;
        return Math.sqrt(dx * dx + dy * dy) < radius;
      });
      if (hit) removed = true;
      return !hit;
    });

    if (removed) {
      renderStrokes();
      saveToStorage();
    }
  }

  function zoomIn() {
    scale = Math.min(3.5, scale * 1.25);
    updateTransform();
    saveToStorage();
  }

  function zoomOut() {
    scale = Math.max(0.15, scale / 1.25);
    updateTransform();
    saveToStorage();
  }

  function resetZoom() {
    scale = 1;
    updateTransform();
    saveToStorage();
  }

  function centerView() {
    scale = 1;
    panX = 80;
    panY = 100;
    updateTransform();
    saveToStorage();
  }

  function saveToStorage() {
    if (window.Pages) Pages.saveCurrentPageState();
    if (window.App) window.App.saveState();
  }

  return {
    init,
    screenToWorld,
    worldToScreen,
    updateTransform,
    renderStrokes,
    getStrokes: () => strokes,
    setStrokes: (s) => { strokes = s || []; renderStrokes(); },
    addRemoteStroke: (stroke) => {
      if (!stroke || !stroke.points) return;
      strokes.push(stroke);
      renderStrokes();
    },
    getScale: () => scale,
    setScale: (val) => { scale = val; updateTransform(); },
    getPan: () => ({ x: panX, y: panY }),
    setPan: (x, y) => { panX = x; panY = y; updateTransform(); },
    zoomIn,
    zoomOut,
    resetZoom,
    centerView
  };
})();

window.Canvas = Canvas;
