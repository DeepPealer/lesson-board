/**
 * =========================================================
 * MiroSQL Studio - Undo / Redo History Manager
 * =========================================================
 */

const History = (() => {
  const undoStack = [];
  const redoStack = [];
  const MAX_STACK = 40;
  let isExecuting = false;

  function init() {
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // If focused inside a code textarea or input, let the browser handle native text undo
      if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
    });

    // Connect HUD buttons
    document.getElementById('btn-undo')?.addEventListener('click', undo);
    document.getElementById('btn-redo')?.addEventListener('click', redo);
  }

  function capture() {
    if (isExecuting) return;

    // Snapshot of current canvas & items
    const snapshot = {
      strokes: JSON.parse(JSON.stringify(Canvas.getStrokes())),
      items: JSON.parse(JSON.stringify(Widgets.getItems()))
    };

    undoStack.push(snapshot);
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack.length = 0; // clear redo on new action

    updateHUD();
  }

  function undo() {
    if (undoStack.length === 0) {
      if (window.App) window.App.showToast('Нечего отменять (Undo)');
      return;
    }

    isExecuting = true;

    // Save current to redo
    const currentSnapshot = {
      strokes: JSON.parse(JSON.stringify(Canvas.getStrokes())),
      items: JSON.parse(JSON.stringify(Widgets.getItems()))
    };
    redoStack.push(currentSnapshot);

    const prev = undoStack.pop();
    Canvas.setStrokes(prev.strokes);
    Widgets.loadItems(prev.items);

    isExecuting = false;
    updateHUD();
    if (window.App) window.App.showToast('Действие отменено (Undo)');
  }

  function redo() {
    if (redoStack.length === 0) {
      if (window.App) window.App.showToast('Нечего повторять (Redo)');
      return;
    }

    isExecuting = true;

    // Save current to undo
    const currentSnapshot = {
      strokes: JSON.parse(JSON.stringify(Canvas.getStrokes())),
      items: JSON.parse(JSON.stringify(Widgets.getItems()))
    };
    undoStack.push(currentSnapshot);

    const next = redoStack.pop();
    Canvas.setStrokes(next.strokes);
    Widgets.loadItems(next.items);

    isExecuting = false;
    updateHUD();
    if (window.App) window.App.showToast('Действие повторено (Redo)');
  }

  function updateHUD() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.disabled = undoStack.length === 0;
      btnUndo.classList.toggle('opacity-40', undoStack.length === 0);
    }
    if (btnRedo) {
      btnRedo.disabled = redoStack.length === 0;
      btnRedo.classList.toggle('opacity-40', redoStack.length === 0);
    }
  }

  return {
    init,
    capture,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0
  };
})();

window.History = History;
