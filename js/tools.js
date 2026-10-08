/**
 * =========================================================
 * MiroSQL Studio - Tool Palette & Interaction Modes
 * =========================================================
 */

const Tools = (() => {
  let activeTool = 'select'; // select, hand, brush, eraser, sticky, sql, image, assignment, quiz, sql_builder
  let brushColor = '#4f46e5';
  let brushSize = 6;

  function init() {
    // Tool buttons in toolbar
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTool(btn.dataset.tool);
      });
    });

    // Brush color pickers
    document.querySelectorAll('.brush-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.brush-color-btn').forEach(b => b.classList.remove('ring-2', 'ring-indigo-500', 'scale-110'));
        btn.classList.add('ring-2', 'ring-indigo-500', 'scale-110');
        brushColor = btn.dataset.color;
      });
    });

    // Brush size buttons
    document.querySelectorAll('.brush-size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.brush-size-btn').forEach(b => b.classList.remove('bg-indigo-100', 'dark:bg-indigo-900'));
        btn.classList.add('bg-indigo-100', 'dark:bg-indigo-900');
        brushSize = parseInt(btn.dataset.size);
      });
    });

    setTool('select');
  }

  function setTool(toolName) {
    activeTool = toolName;

    // Update toolbar active styles
    document.querySelectorAll('.tool-btn').forEach(btn => {
      if (btn.dataset.tool === toolName) {
        btn.classList.add('bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-950/60', 'ring-2', 'ring-indigo-500/20');
      } else {
        btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-950/60', 'ring-2', 'ring-indigo-500/20');
      }
    });

    const brushBar = document.getElementById('brush-options-bar');
    const container = document.getElementById('canvas-container');

    if (toolName === 'brush') {
      if (brushBar) brushBar.classList.remove('hidden');
      if (container) container.style.cursor = 'crosshair';
    } else if (toolName === 'eraser') {
      if (brushBar) brushBar.classList.add('hidden');
      if (container) container.style.cursor = 'cell';
    } else if (toolName === 'hand') {
      if (brushBar) brushBar.classList.add('hidden');
      if (container) container.style.cursor = 'grab';
    } else {
      if (brushBar) brushBar.classList.add('hidden');
      if (container) container.style.cursor = 'default';
    }
  }

  return {
    init,
    getActiveTool: () => activeTool,
    setTool,
    getBrushColor: () => brushColor,
    getBrushSize: () => brushSize
  };
})();
