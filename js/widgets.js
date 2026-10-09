/**
 * =========================================================
 * MiroSQL Studio - Widgets Engine (Stickies, SQL, ERD, Assignments, Quizzes, Builders)
 * =========================================================
 */

const Widgets = (() => {
  let items = []; // { id, type, x, y, width, height, isLocked, ... }
  let selectedId = null;
  let activeDrag = null;
  let activeResize = null;

  const STICKY_THEMES = [
    { name: 'yellow', cls: 'sticky-theme-yellow', label: 'Желтый' },
    { name: 'green', cls: 'sticky-theme-green', label: 'Зеленый' },
    { name: 'blue', cls: 'sticky-theme-blue', label: 'Голубой' },
    { name: 'pink', cls: 'sticky-theme-pink', label: 'Розовый' },
    { name: 'purple', cls: 'sticky-theme-purple', label: 'Фиолетовый' },
    { name: 'orange', cls: 'sticky-theme-orange', label: 'Оранжевый' },
  ];

  const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  function registerItem(itemData) {
    const idx = items.findIndex(i => i.id === itemData.id);
    if (idx >= 0) {
      items[idx] = itemData;
    } else {
      items.push(itemData);
    }
  }

  function init() {
    ensureErdSvgLayer();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Keyboard delete
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (!['TEXTAREA', 'INPUT'].includes(e.target.tagName)) {
          const item = items.find(i => i.id === selectedId);
          if (item && item.isLocked && Collab.getRole() !== 'teacher') {
            if (window.App) window.App.showToast('Элемент заблокирован преподавателем 🔒');
            return;
          }
          e.preventDefault();
          deleteItem(selectedId);
        }
      }
    });

    // Auto-refresh SQL & ERD widgets on DB change
    DB.on('change', (eventData) => {
      items.filter(i => i.type === 'sql' || i.type === 'assignment').forEach(item => {
        const el = document.getElementById(item.id);
        if (el && el._runQuery && item.query && item.query.trim().toUpperCase().startsWith('SELECT')) {
          el._runQuery();
        }
      });

      refreshErdWidgets(eventData);
    });
  }

  function deselectAll() {
    selectedId = null;
    document.querySelectorAll('.board-item').forEach(el => el.classList.remove('selected'));
  }

  let highestZIndex = 20;

  function selectItem(id) {
    if (selectedId === id) return;
    deselectAll();
    selectedId = id;
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('selected');
      highestZIndex += 2;
      el.style.zIndex = highestZIndex;
    }
  }

  function deleteItem(id) {
    const item = items.find(i => i.id === id);
    if (item && item.isLocked && Collab.getRole() !== 'teacher') {
      if (window.App) window.App.showToast('Нельзя удалить заблокированный элемент 🔒');
      return;
    }

    if (window.History) History.capture();
    items = items.filter(i => i.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    if (selectedId === id) selectedId = null;
    saveBoard();
    if (window.Collab) Collab.broadcastItemDelete(id);
    if (window.App) window.App.showToast('Элемент удален');
  }

  // 8-Direction Resizing Helper
  function attach8WayResizable(itemEl, itemData, minW = 200, minH = 140) {
    RESIZE_DIRECTIONS.forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `resize-handle resize-handle-${dir}`;
      handle.dataset.dir = dir;
      itemEl.appendChild(handle);

      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || itemData.isLocked) return;
        e.stopPropagation();
        selectItem(itemEl.id);

        if (window.History) History.capture();

        activeResize = {
          itemEl,
          itemData,
          dir,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: itemData.x,
          startY: itemData.y,
          startW: itemData.width,
          startH: itemData.height,
          minW,
          minH
        };
      });
    });
  }

  // Draggable Header Attachment
  function attachDraggable(itemEl, handleEl, itemData) {
    handleEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
        return;
      }
      if (itemData.isLocked && Collab.getRole() !== 'teacher') {
        if (window.App) window.App.showToast('Элемент заблокирован преподавателем 🔒');
        return;
      }

      e.stopPropagation();
      selectItem(itemEl.id);

      if (window.History) History.capture();

      activeDrag = {
        itemEl,
        itemData,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: itemData.x,
        startY: itemData.y
      };
    });
  }

  let lastMoveBroadcast = 0;

  function onPointerMove(e) {
    const scale = Canvas.getScale();

    if (activeDrag) {
      const dx = (e.clientX - activeDrag.startClientX) / scale;
      const dy = (e.clientY - activeDrag.startClientY) / scale;
      activeDrag.itemData.x = Math.round(activeDrag.startX + dx);
      activeDrag.itemData.y = Math.round(activeDrag.startY + dy);
      activeDrag.itemEl.style.left = `${activeDrag.itemData.x}px`;
      activeDrag.itemEl.style.top = `${activeDrag.itemData.y}px`;

      if (activeDrag.itemData.type === 'erd_table') {
        updateErdConnectors();
      }

      const now = Date.now();
      if (now - lastMoveBroadcast > 35) {
        lastMoveBroadcast = now;
        if (window.Collab) {
          Collab.broadcastItemMove(activeDrag.itemData.id, activeDrag.itemData.x, activeDrag.itemData.y, activeDrag.itemData.width, activeDrag.itemData.height);
        }
      }
    }

    if (activeResize) {
      const { dir, startX, startY, startW, startH, minW, minH, itemData, itemEl } = activeResize;
      const dx = (e.clientX - activeResize.startClientX) / scale;
      const dy = (e.clientY - activeResize.startClientY) / scale;

      let newW = startW;
      let newH = startH;
      let newX = startX;
      let newY = startY;

      // Horizontal resize
      if (dir.includes('e')) {
        newW = Math.max(minW, Math.round(startW + dx));
      } else if (dir.includes('w')) {
        const potentialW = Math.round(startW - dx);
        if (potentialW >= minW) {
          newW = potentialW;
          newX = Math.round(startX + dx);
        }
      }

      // Vertical resize
      if (dir.includes('s')) {
        newH = Math.max(minH, Math.round(startH + dy));
      } else if (dir.includes('n')) {
        const potentialH = Math.round(startH - dy);
        if (potentialH >= minH) {
          newH = potentialH;
          newY = Math.round(startY + dy);
        }
      }

      itemData.width = newW;
      itemData.height = newH;
      itemData.x = newX;
      itemData.y = newY;

      itemEl.style.width = `${newW}px`;
      itemEl.style.height = `${newH}px`;
      itemEl.style.left = `${newX}px`;
      itemEl.style.top = `${newY}px`;

      if (itemData.type === 'erd_table') {
        updateErdConnectors();
      }

      const now = Date.now();
      if (now - lastMoveBroadcast > 35) {
        lastMoveBroadcast = now;
        if (window.Collab) {
          Collab.broadcastItemMove(itemData.id, itemData.x, itemData.y, itemData.width, itemData.height);
        }
      }
    }
  }

  function onPointerUp() {
    if (activeDrag || activeResize) {
      const targetItem = (activeDrag && activeDrag.itemData) || (activeResize && activeResize.itemData);
      const wasErd = targetItem && targetItem.type === 'erd_table';
      if (targetItem && window.Collab) {
        Collab.broadcastItemMove(targetItem.id, targetItem.x, targetItem.y, targetItem.width, targetItem.height);
      }
      activeDrag = null;
      activeResize = null;
      if (wasErd) updateErdConnectors();
      saveBoard();
    }
  }

  function updateItemLockUI(id, isLocked) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('locked', isLocked);
    const lockIcon = el.querySelector('.btn-lock-toggle i');
    if (lockIcon) {
      lockIcon.setAttribute('data-lucide', isLocked ? 'lock' : 'unlock');
      lucide.createIcons();
    }
  }

  // ==========================================
  // 1. Sticky Note Component
  // ==========================================
  function createSticky(x, y, content = 'Заметка... Нажмите чтобы писать!', themeName = 'yellow', width = 250, height = 220, existingId = null, isLocked = false, fromRemote = false) {
    const id = existingId || 'sticky_' + Date.now();
    const currentTheme = STICKY_THEMES.find(t => t.name === themeName) || STICKY_THEMES[0];

    const itemData = {
      id,
      type: 'sticky',
      x,
      y,
      width,
      height,
      content,
      theme: currentTheme.name,
      isLocked
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl p-4 border-2 flex flex-col ${currentTheme.cls} ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="sticky-handle flex items-center justify-between pb-2 cursor-grab select-none">
        <div class="flex items-center gap-1.5 opacity-60">
          <span class="w-2.5 h-2.5 rounded-full bg-current opacity-40"></span>
          <span class="text-[10px] font-bold uppercase tracking-wider">Заметка</span>
        </div>
        <div class="flex items-center gap-1">
          <!-- Lock toggle -->
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Заблокировать (Lock)">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5 ${isLocked ? 'text-amber-600' : ''}"></i>
          </button>
          <!-- Color Switcher -->
          <button class="btn-color-cycle p-1 rounded hover:bg-black/10 transition" title="Сменить цвет">
            <i data-lucide="palette" class="w-3.5 h-3.5"></i>
          </button>
          <!-- Delete -->
          <button class="btn-delete-item p-1 rounded hover:bg-rose-500/20 text-rose-700 transition" title="Удалить">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <textarea class="sticky-textarea flex-1 min-h-0 overflow-y-auto w-full bg-transparent resize-none outline-none font-handwriting text-lg leading-snug placeholder-black/30">${content}</textarea>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.sticky-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 180, 140);

    const textarea = el.querySelector('.sticky-textarea');
    textarea.addEventListener('pointerdown', e => e.stopPropagation());
    textarea.addEventListener('input', () => {
      itemData.content = textarea.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'content', textarea.value);
    });

    // Lock button
    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', e => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
      if (window.Collab) Collab.broadcastItemLock(id, itemData.isLocked);
      if (window.App) window.App.showToast(itemData.isLocked ? 'Элемент заблокирован 🔒' : 'Элемент разблокирован 🔓');
    });

    // Color button
    const btnColor = el.querySelector('.btn-color-cycle');
    btnColor.addEventListener('pointerdown', e => e.stopPropagation());
    btnColor.addEventListener('click', e => {
      e.stopPropagation();
      const currentIdx = STICKY_THEMES.findIndex(t => t.name === itemData.theme);
      const nextTheme = STICKY_THEMES[(currentIdx + 1) % STICKY_THEMES.length];
      itemData.theme = nextTheme.name;
      STICKY_THEMES.forEach(t => el.classList.remove(t.cls));
      el.classList.add(nextTheme.cls);
      saveBoard();
      if (window.Collab) Collab.broadcastItemUpdate(id, { theme: itemData.theme });
    });

    // Delete button
    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', e => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  // ==========================================
  // 2. Interactive Assignment Card Widget
  // ==========================================
  function createAssignmentWidget(x, y, title = "Задание: Выборка данных", prompt = "Напишите SQL-запрос для выборки студентов.", expectedQuery = "SELECT * FROM students;", initialSql = "SELECT ", width = 640, height = 540, existingId = null, isLocked = false, existingAttempts = null, existingComments = null, fromRemote = false) {
    const id = existingId || 'task_' + Date.now();
    const initialQuery = initialSql || "SELECT ";

    const itemData = {
      id,
      type: 'assignment',
      x,
      y,
      width,
      height,
      title,
      prompt,
      expectedQuery,
      query: initialQuery,
      isLocked,
      attempts: existingAttempts || [],
      comments: existingComments || []
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <!-- Header -->
      <div class="task-handle flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 border-b border-indigo-100 dark:border-indigo-900/50 cursor-grab select-none">
        <div class="flex items-center gap-2 flex-1 mr-2">
          <div class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
            <i data-lucide="check-square" class="w-3.5 h-3.5"></i>
          </div>
          <input type="text" class="task-title-input text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none px-1 rounded transition w-full" value="${title}" />
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Заблокировать/Разблокировать">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-delete-item p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition" title="Удалить карточку">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- Problem Statement & Prompt (Editable) -->
      <div class="p-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <div class="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <i data-lucide="help-circle" class="w-3.5 h-3.5 text-indigo-500"></i>
            <span>Условие задачи:</span>
          </div>
          <span class="text-[10px] text-indigo-500 font-medium">Редактируемое условие</span>
        </div>
        <textarea class="task-prompt-input w-full p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 outline-none resize-none leading-relaxed focus:ring-1 focus:ring-indigo-500 min-h-[44px] max-h-32 overflow-y-auto font-sans" placeholder="Введите формулировку задания...">${prompt}</textarea>
      </div>

      <!-- Code Editor Panel -->
      <div class="flex flex-col flex-1 min-h-0 bg-slate-950 text-slate-100">
        <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px]">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="font-mono text-slate-400">Ваш SQL-ответ</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn-show-solution text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-2 py-0.5 rounded hover:bg-slate-800 transition flex items-center gap-1">
              <i data-lucide="eye" class="w-3 h-3"></i>
              <span>Показать решение</span>
            </button>
            <button class="btn-test-assignment flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition active:scale-95 shadow-sm shadow-emerald-500/30">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
              <span>Проверить решение</span>
            </button>
          </div>
        </div>

        <!-- Hidden Solution Drawer (Editable reference solution) -->
        <div class="solution-drawer hidden p-3 bg-indigo-950/80 border-b border-indigo-800/50 text-xs font-mono text-indigo-200">
          <div class="flex items-center justify-between mb-1.5 text-[10px] uppercase font-bold text-indigo-400">
            <span class="flex items-center gap-1"><i data-lucide="key" class="w-3 h-3"></i> Эталонный запрос преподавателя:</span>
            <span class="text-[9px] bg-indigo-800 text-indigo-200 px-1.5 py-0.5 rounded font-sans">Редактируемый эталон</span>
          </div>
          <textarea class="task-expected-editor w-full p-2.5 bg-slate-950/90 text-emerald-300 rounded-xl border border-indigo-700/60 text-xs font-mono outline-none resize-none min-h-[50px] max-h-28 overflow-y-auto leading-relaxed" placeholder="Введите эталонный SQL-запрос преподавателя (SELECT ...)...">${expectedQuery}</textarea>
          <div class="mt-1.5 flex items-center justify-between text-[10px]">
            <span class="text-indigo-300/80">С этим эталоном сверяется ответ студента</span>
            <button type="button" class="btn-copy-expected text-xs font-semibold text-indigo-300 hover:text-white px-2.5 py-1 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 transition flex items-center gap-1">
              <i data-lucide="corner-down-left" class="w-3 h-3"></i> Скопировать в поле ответа
            </button>
          </div>
        </div>

        <!-- Student SQL Input -->
        <div class="h-28 flex-shrink-0 bg-slate-950">
          <textarea class="task-sql-editor w-full h-full p-3 bg-transparent text-emerald-300 font-mono text-xs outline-none resize-none leading-relaxed border-none overflow-y-auto" spellcheck="false">${initialQuery}</textarea>
        </div>

        <!-- Results & Tests Output -->
        <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px]">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-slate-700 dark:text-slate-200">Тестирование и проверка</span>
              <span class="task-eval-badge px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Не проверено</span>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-400">
              <span class="btn-toggle-attempts cursor-pointer hover:text-indigo-600">История попыток (<span class="attempts-count">${itemData.attempts.length}</span>)</span>
            </div>
          </div>

          <div class="task-results-viewport flex-1 min-h-0 overflow-y-auto p-3 text-xs">
            <!-- Validation Message Box -->
            <div class="task-validation-msg p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
              Напишите ваш SQL-запрос и нажмите «Проверить решение». Автопроверка сравнит итоговые данные с эталоном!
            </div>

            <!-- Attempt History List (collapsible) -->
            <div class="task-attempts-list hidden mt-2 space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-2 font-mono text-[11px]"></div>

            <!-- Inline Teacher Comments Section -->
            <div class="task-comments-section mt-2 border-t border-slate-200 dark:border-slate-800 pt-2">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[10px] font-bold uppercase text-slate-400">Комментарии учителя</span>
                <button class="btn-show-comment-form text-[10px] font-semibold text-indigo-600 hover:underline">+ Оставить комментарий</button>
              </div>
              <div class="comment-form-panel hidden mb-2 flex gap-1.5">
                <input type="text" class="new-comment-input flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none" placeholder="Текст комментария..." />
                <button class="btn-submit-comment px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Добавить</button>
              </div>
              <div class="comments-list space-y-1"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.task-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 440, 360);

    // Title input
    const titleInput = el.querySelector('.task-title-input');
    titleInput.addEventListener('pointerdown', e => e.stopPropagation());
    titleInput.addEventListener('input', () => {
      itemData.title = titleInput.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'title', titleInput.value);
    });

    // Prompt input
    const promptInput = el.querySelector('.task-prompt-input');
    promptInput.addEventListener('pointerdown', e => e.stopPropagation());
    promptInput.addEventListener('input', () => {
      itemData.prompt = promptInput.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'prompt', promptInput.value);
    });

    // Expected query editor
    const expectedEditor = el.querySelector('.task-expected-editor');
    expectedEditor.addEventListener('pointerdown', e => e.stopPropagation());
    expectedEditor.addEventListener('input', () => {
      itemData.expectedQuery = expectedEditor.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'expectedQuery', expectedEditor.value);
    });

    const btnCopyExpected = el.querySelector('.btn-copy-expected');
    btnCopyExpected.addEventListener('pointerdown', e => e.stopPropagation());
    btnCopyExpected.addEventListener('click', (e) => {
      e.stopPropagation();
      editor.value = itemData.expectedQuery;
      itemData.query = itemData.expectedQuery;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'query', itemData.expectedQuery);
      if (window.App) window.App.showToast('Эталонный запрос скопирован в редактор ответа');
    });

    // Student SQL editor
    const editor = el.querySelector('.task-sql-editor');
    editor.addEventListener('pointerdown', e => e.stopPropagation());
    editor.addEventListener('input', () => {
      itemData.query = editor.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'query', editor.value);
    });

    // Check solution logic
    const btnTest = el.querySelector('.btn-test-assignment');
    const badge = el.querySelector('.task-eval-badge');
    const msgBox = el.querySelector('.task-validation-msg');
    const attemptsList = el.querySelector('.task-attempts-list');
    const attemptsCountEl = el.querySelector('.attempts-count');

    function evaluateSubmission() {
      const studentSql = editor.value;
      const targetExpected = itemData.expectedQuery || expectedQuery;
      const res = DB.checkQueryAgainstExpected(studentSql, targetExpected);

      // Record Attempt
      itemData.attempts.push({
        sql: studentSql,
        success: res.success,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        message: res.message
      });
      attemptsCountEl.textContent = itemData.attempts.length;
      renderAttempts();

      if (res.success) {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
        badge.textContent = 'Пройдено ✅';
        msgBox.className = 'p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 leading-relaxed font-sans';
        msgBox.innerHTML = `<strong>Отлично!</strong> ${res.message}`;

        if (window.confetti) {
          confetti({
            particleCount: 25,
            spread: 50,
            origin: {
              x: (el.getBoundingClientRect().left + el.offsetWidth / 2) / window.innerWidth,
              y: (el.getBoundingClientRect().top + el.offsetHeight / 2) / window.innerHeight
            }
          });
        }
      } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
        badge.textContent = 'Ошибка ❌';
        msgBox.className = 'p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 leading-relaxed font-sans';
        msgBox.innerHTML = `<strong>Не совсем так:</strong> ${res.message}`;
      }

      saveBoard();
    }

    function renderAttempts() {
      attemptsList.innerHTML = '';
      itemData.attempts.slice().reverse().forEach(att => {
        const row = document.createElement('div');
        row.className = `p-1.5 rounded-lg flex items-center justify-between cursor-pointer ${att.success ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'}`;
        row.innerHTML = `
          <div class="flex items-center gap-2 truncate flex-1">
            <span>${att.success ? '✅' : '❌'}</span>
            <span class="truncate">${att.sql}</span>
          </div>
          <span class="text-[9px] text-slate-400 ml-2 whitespace-nowrap">${att.timestamp}</span>
        `;
        row.addEventListener('click', () => {
          editor.value = att.sql;
          itemData.query = att.sql;
          saveBoard();
        });
        attemptsList.appendChild(row);
      });
    }

    btnTest.addEventListener('pointerdown', e => e.stopPropagation());
    btnTest.addEventListener('click', (e) => {
      e.stopPropagation();
      evaluateSubmission();
    });

    editor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        evaluateSubmission();
      }
    });

    // Show solution button
    const btnShowSol = el.querySelector('.btn-show-solution');
    const solDrawer = el.querySelector('.solution-drawer');
    btnShowSol.addEventListener('pointerdown', e => e.stopPropagation());
    btnShowSol.addEventListener('click', (e) => {
      e.stopPropagation();
      solDrawer.classList.toggle('hidden');
      const isVisible = !solDrawer.classList.contains('hidden');
      btnShowSol.innerHTML = `<i data-lucide="${isVisible ? 'eye-off' : 'eye'}" class="w-3 h-3"></i><span>${isVisible ? 'Скрыть решение' : 'Показать решение'}</span>`;
      lucide.createIcons();
    });

    // Toggle attempts list
    const btnToggleAtt = el.querySelector('.btn-toggle-attempts');
    btnToggleAtt.addEventListener('pointerdown', e => e.stopPropagation());
    btnToggleAtt.addEventListener('click', (e) => {
      e.stopPropagation();
      attemptsList.classList.toggle('hidden');
    });

    // Teacher inline comments without blocking prompt()
    const btnShowCommentForm = el.querySelector('.btn-show-comment-form');
    const commentFormPanel = el.querySelector('.comment-form-panel');
    const commentInput = el.querySelector('.new-comment-input');
    const btnSubmitComment = el.querySelector('.btn-submit-comment');
    const commentsList = el.querySelector('.comments-list');

    btnShowCommentForm.addEventListener('pointerdown', e => e.stopPropagation());
    btnShowCommentForm.addEventListener('click', (e) => {
      e.stopPropagation();
      commentFormPanel.classList.toggle('hidden');
      if (!commentFormPanel.classList.contains('hidden')) commentInput.focus();
    });

    function renderComments() {
      commentsList.innerHTML = '';
      if (!itemData.comments || itemData.comments.length === 0) {
        commentsList.innerHTML = '<div class="text-[11px] text-slate-400 italic">Нет комментариев к этому заданию</div>';
        return;
      }
      itemData.comments.forEach((c, idx) => {
        const cEl = document.createElement('div');
        cEl.className = 'p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200';
        cEl.innerHTML = `
          <div class="flex items-center justify-between font-bold mb-0.5">
            <span>💬 ${c.author}</span>
            <button class="btn-del-comment text-slate-400 hover:text-rose-500 text-xs px-1">×</button>
          </div>
          ${c.snippet ? `<div class="bg-amber-100/60 dark:bg-amber-900/40 font-mono px-1.5 py-0.5 rounded text-[10px] mb-1">Фрагмент: "${c.snippet}"</div>` : ''}
          <div>${c.text}</div>
        `;
        const delBtn = cEl.querySelector('.btn-del-comment');
        delBtn.addEventListener('pointerdown', e => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          itemData.comments.splice(idx, 1);
          renderComments();
          saveBoard();
        });
        commentsList.appendChild(cEl);
      });
    }

    const addComment = () => {
      const text = commentInput.value.trim();
      if (!text) return;
      const selectedSnippet = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
      if (!itemData.comments) itemData.comments = [];
      itemData.comments.push({
        author: Collab.getRole() === 'teacher' ? 'Преподаватель' : 'Студент',
        snippet: selectedSnippet,
        text
      });
      commentInput.value = '';
      commentFormPanel.classList.add('hidden');
      renderComments();
      saveBoard();
      if (window.App) window.App.showToast('Комментарий добавлен');
    };

    btnSubmitComment.addEventListener('pointerdown', e => e.stopPropagation());
    btnSubmitComment.addEventListener('click', (e) => {
      e.stopPropagation();
      addComment();
    });
    commentInput.addEventListener('pointerdown', e => e.stopPropagation());
    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addComment();
      }
    });

    renderComments();
    renderAttempts();

    // Lock & Delete
    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
    });

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  // ==========================================
  // 3. Mini-Quiz Widget Component
  // ==========================================
  function createQuizWidget(x, y, question = "Какое ключевое слово используется для фильтрации строк?", options = ["SELECT", "WHERE", "ORDER BY", "JOIN"], correctIdx = 1, explanation = "Предложение WHERE задает условия фильтрации строк в таблице.", width = 360, height = 320, existingId = null, isLocked = false, existingSelectedIndex = null, fromRemote = false) {
    const id = existingId || 'quiz_' + Date.now();

    const itemData = {
      id,
      type: 'quiz',
      x,
      y,
      width,
      height,
      question,
      options: Array.isArray(options) ? [...options] : ["SELECT", "WHERE", "ORDER BY", "JOIN"],
      correctIdx: typeof correctIdx === 'number' ? correctIdx : 1,
      explanation,
      isLocked,
      selectedIndex: existingSelectedIndex !== undefined ? existingSelectedIndex : null,
      isEditing: false
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden p-3.5 ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="quiz-handle flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 cursor-grab select-none">
        <div class="flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs shrink-0">
            <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
          </span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">SQL Мини-Квиз</span>
        </div>
        <div class="flex items-center gap-1">
          <button class="btn-reset-quiz-ans p-1 rounded hover:bg-black/10 text-slate-400 hover:text-amber-500 transition text-[10px] font-semibold hidden" title="Сбросить и ответить снова">
            🔄 Заново
          </button>
          <button class="btn-toggle-quiz-edit p-1 rounded hover:bg-black/10 text-slate-400 hover:text-indigo-600 transition" title="Редактировать вопрос и варианты">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Заблокировать/Разблокировать">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-delete-item p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition" title="Удалить квиз">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- 1. Solve View -->
      <div class="quiz-solve-view flex flex-col flex-1 min-h-0 pt-2">
        <div class="quiz-display-question font-bold text-xs text-slate-800 dark:text-slate-100 leading-snug mb-2">
          ${itemData.question}
        </div>
        <div class="quiz-options-list space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5"></div>
        <div class="quiz-explanation hidden mt-2 p-2 rounded-xl text-[11px] leading-relaxed"></div>
      </div>

      <!-- 2. Edit View -->
      <div class="quiz-edit-view hidden flex flex-col flex-1 min-h-0 pt-2 overflow-y-auto text-xs space-y-1.5 pr-0.5">
        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 block">Вопрос:</label>
        <textarea class="quiz-edit-q-input w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none resize-none min-h-[48px] max-h-28 overflow-y-auto font-semibold">${itemData.question}</textarea>

        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 mb-0.5 block">Варианты ответа (выберите верный радиокнопкой):</label>
        <div class="quiz-edit-opts-container space-y-1.5 min-h-0 overflow-y-auto max-h-44"></div>
        <button class="btn-add-opt-row text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 text-left">+ Добавить вариант</button>

        <label class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 mb-0.5 block">Пояснение к ответу:</label>
        <textarea class="quiz-edit-expl-input w-full p-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none resize-none min-h-[42px] max-h-24 overflow-y-auto">${itemData.explanation}</textarea>

        <button class="btn-save-quiz-edit mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition">
          ✓ Сохранить изменения
        </button>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.quiz-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 280, 240);

    const solveView = el.querySelector('.quiz-solve-view');
    const editView = el.querySelector('.quiz-edit-view');
    const explBox = el.querySelector('.quiz-explanation');
    const optionsContainer = el.querySelector('.quiz-options-list');
    const btnResetAns = el.querySelector('.btn-reset-quiz-ans');
    const btnToggleEdit = el.querySelector('.btn-toggle-quiz-edit');

    // Render options in solve mode
    function renderSolveOptions() {
      optionsContainer.innerHTML = '';
      el.querySelector('.quiz-display-question').textContent = itemData.question;
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

      itemData.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-opt-btn w-full text-left p-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition flex items-center justify-between';
        btn.dataset.optIdx = idx;
        btn.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">${letters[idx] || (idx + 1)}</span>
            <span>${opt}</span>
          </div>
          <span class="opt-status-icon"></span>
        `;

        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          applyAnswer(idx);
        });

        optionsContainer.appendChild(btn);
      });

      if (itemData.selectedIndex !== null) {
        applyAnswer(itemData.selectedIndex, false);
      } else {
        explBox.classList.add('hidden');
        btnResetAns.classList.add('hidden');
      }
    }

    function applyAnswer(idx, triggerConfetti = true) {
      itemData.selectedIndex = idx;
      const isCorrect = idx === itemData.correctIdx;
      btnResetAns.classList.remove('hidden');

      el.querySelectorAll('.quiz-opt-btn').forEach((b, bIdx) => {
        b.disabled = true;
        if (bIdx === itemData.correctIdx) {
          b.className = 'w-full text-left p-2 rounded-xl text-xs font-semibold border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center justify-between';
          b.querySelector('.opt-status-icon').innerHTML = '✅';
        } else if (bIdx === idx) {
          b.className = 'w-full text-left p-2 rounded-xl text-xs font-semibold border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 flex items-center justify-between';
          b.querySelector('.opt-status-icon').innerHTML = '❌';
        } else {
          b.className = 'w-full text-left p-2 rounded-xl text-xs font-normal border border-slate-200 dark:border-slate-800 opacity-50 flex items-center justify-between';
        }
      });

      explBox.classList.remove('hidden');
      if (isCorrect) {
        explBox.className = 'quiz-explanation mt-2 p-2.5 rounded-xl text-[11px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
        explBox.innerHTML = `<strong>Верно! 🎉</strong> ${itemData.explanation}`;
        if (triggerConfetti && window.confetti) confetti({ particleCount: 20 });
      } else {
        explBox.className = 'quiz-explanation mt-2 p-2.5 rounded-xl text-[11px] bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300';
        explBox.innerHTML = `<strong>Не совсем так.</strong> ${itemData.explanation}`;
      }
      saveBoard();
      if (window.Collab) Collab.broadcastItemUpdate(id, { selectedIndex: itemData.selectedIndex });
    }

    btnResetAns.addEventListener('pointerdown', e => e.stopPropagation());
    btnResetAns.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.selectedIndex = null;
      renderSolveOptions();
      saveBoard();
      if (window.Collab) Collab.broadcastItemUpdate(id, { selectedIndex: null });
    });

    el._rerenderWidget = (updatedData) => {
      if (updatedData) Object.assign(itemData, updatedData);
      renderSolveOptions();
    };

    // Render options in edit mode
    const editOptsContainer = el.querySelector('.quiz-edit-opts-container');
    const editQInput = el.querySelector('.quiz-edit-q-input');
    const editExplInput = el.querySelector('.quiz-edit-expl-input');
    const btnAddOptRow = el.querySelector('.btn-add-opt-row');
    const btnSaveEdit = el.querySelector('.btn-save-quiz-edit');

    function renderEditOptions() {
      editOptsContainer.innerHTML = '';
      itemData.options.forEach((opt, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1.5';
        row.innerHTML = `
          <input type="radio" name="correct_opt_${id}" ${idx === itemData.correctIdx ? 'checked' : ''} class="opt-radio cursor-pointer text-indigo-600" title="Сделать правильным ответом" />
          <input type="text" class="opt-text-input flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none" value="${opt}" />
          <button type="button" class="btn-del-opt text-slate-400 hover:text-rose-500 text-sm px-1 font-bold" title="Удалить вариант">×</button>
        `;

        const radio = row.querySelector('.opt-radio');
        radio.addEventListener('pointerdown', e => e.stopPropagation());
        radio.addEventListener('change', () => {
          itemData.correctIdx = idx;
        });

        const textInput = row.querySelector('.opt-text-input');
        textInput.addEventListener('pointerdown', e => e.stopPropagation());
        textInput.addEventListener('input', () => {
          itemData.options[idx] = textInput.value;
        });

        const delBtn = row.querySelector('.btn-del-opt');
        delBtn.addEventListener('pointerdown', e => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (itemData.options.length <= 2) {
            if (window.App) window.App.showToast('В квизе должно быть минимум 2 варианта ответа');
            return;
          }
          itemData.options.splice(idx, 1);
          if (itemData.correctIdx >= itemData.options.length) itemData.correctIdx = 0;
          renderEditOptions();
        });

        editOptsContainer.appendChild(row);
      });
    }

    editQInput.addEventListener('pointerdown', e => e.stopPropagation());
    editQInput.addEventListener('input', () => {
      itemData.question = editQInput.value;
    });

    editExplInput.addEventListener('pointerdown', e => e.stopPropagation());
    editExplInput.addEventListener('input', () => {
      itemData.explanation = editExplInput.value;
    });

    btnAddOptRow.addEventListener('pointerdown', e => e.stopPropagation());
    btnAddOptRow.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.options.push(`Новый вариант ${itemData.options.length + 1}`);
      renderEditOptions();
    });

    function toggleEditMode(enable) {
      itemData.isEditing = enable !== undefined ? enable : !itemData.isEditing;
      if (itemData.isEditing) {
        solveView.classList.add('hidden');
        editView.classList.remove('hidden');
        btnResetAns.classList.add('hidden');
        btnToggleEdit.classList.add('text-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-950/60');
        editQInput.value = itemData.question;
        editExplInput.value = itemData.explanation;
        renderEditOptions();
      } else {
        editView.classList.add('hidden');
        solveView.classList.remove('hidden');
        btnToggleEdit.classList.remove('text-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-950/60');
        itemData.selectedIndex = null;
        renderSolveOptions();
        saveBoard();
      }
    }

    btnToggleEdit.addEventListener('pointerdown', e => e.stopPropagation());
    btnToggleEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEditMode();
    });

    btnSaveEdit.addEventListener('pointerdown', e => e.stopPropagation());
    btnSaveEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEditMode(false);
      if (window.App) window.App.showToast('Квиз сохранен');
    });

    renderSolveOptions();

    // Lock & Delete
    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
    });

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  // ==========================================
  // 4. Drag & Drop SQL Builder Widget
  // ==========================================
  function createSqlBuilderWidget(x, y, slots = [], customBlocks = [], width = 520, height = 380, existingId = null, isLocked = false, fromRemote = false) {
    const id = existingId || 'builder_' + Date.now();

    const DEFAULT_BLOCKS = [
      'SELECT', '*', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'ON', 'ORDER BY', 'LIMIT 5',
      'students', 'courses', 'enrollments', 'name', 'gpa', 'department', 'title', 'credits', 'gpa > 3.5'
    ];

    const itemData = {
      id,
      type: 'sql_builder',
      x,
      y,
      width,
      height,
      slots: Array.isArray(slots) ? [...slots] : [],
      customBlocks: Array.isArray(customBlocks) ? [...customBlocks] : [],
      isLocked
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden p-3.5 ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="builder-handle flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 cursor-grab select-none">
        <div class="flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
            <i data-lucide="blocks" class="w-3.5 h-3.5"></i>
          </span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Drag & Drop SQL Конструктор</span>
        </div>
        <div class="flex items-center gap-1">
          <button class="btn-clear-slots text-[10px] text-slate-400 hover:text-indigo-600 font-semibold px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition">Сброс</button>
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Заблокировать/Разблокировать">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-delete-item p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition" title="Удалить конструктор">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto flex flex-col space-y-2 pr-0.5 pt-1">
        <!-- Palette Controls & Custom Block Adder -->
        <div class="pt-1 flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Палитра блоков (кликните или перетащите):</span>
          <button class="btn-toggle-add-custom text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">+ Свой блок</button>
        </div>

        <!-- Add Custom Block Inline Form -->
        <div class="custom-block-form hidden pt-1 pb-1 flex gap-1.5">
          <input type="text" class="custom-block-input flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none" placeholder="Текст блока (например: COUNT(*), GROUP BY id)..." />
          <button class="btn-submit-custom-block px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0">Добавить</button>
        </div>

        <!-- Blocks Palette Container -->
        <div class="blocks-palette flex flex-wrap gap-1.5 py-1.5 max-h-32 overflow-y-auto pr-0.5"></div>

        <!-- Assembly Dropzone -->
        <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1 mb-0.5">
          <span>Собранный запрос:</span>
          <span class="slots-counter font-mono font-normal lowercase text-slate-400">0 блоков</span>
        </div>

        <div class="sql-dropzone bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center gap-1.5 font-mono text-xs text-emerald-300 min-h-[52px] max-h-28 overflow-y-auto transition-colors">
          <span class="placeholder-text text-slate-500 italic select-none text-xs">Перетащите или нажимайте блоки выше для сборки SQL...</span>
        </div>

        <!-- Action Bar & Execution Result -->
        <div class="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 mt-1">
          <div class="flex-1 truncate">
            <span class="builder-status-text text-[11px] font-mono text-slate-500"></span>
          </div>
          <button class="btn-run-assembled px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0">
            <i data-lucide="play" class="w-3 h-3 fill-white"></i> Выполнить
          </button>
        </div>

        <!-- Inline Mini Table Results Preview -->
        <div class="builder-results-preview hidden mt-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 max-h-40 overflow-auto text-[11px]"></div>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.builder-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 400, 280);

    const paletteEl = el.querySelector('.blocks-palette');
    const dropzone = el.querySelector('.sql-dropzone');
    const counterEl = el.querySelector('.slots-counter');
    const statusText = el.querySelector('.builder-status-text');
    const resultsPreview = el.querySelector('.builder-results-preview');
    const customBlockForm = el.querySelector('.custom-block-form');
    const customBlockInput = el.querySelector('.custom-block-input');
    const btnSubmitCustom = el.querySelector('.btn-submit-custom-block');
    const btnToggleCustom = el.querySelector('.btn-toggle-add-custom');

    // Toggle custom block adder form
    btnToggleCustom.addEventListener('pointerdown', e => e.stopPropagation());
    btnToggleCustom.addEventListener('click', (e) => {
      e.stopPropagation();
      customBlockForm.classList.toggle('hidden');
      if (!customBlockForm.classList.contains('hidden')) customBlockInput.focus();
    });

    const addCustomBlock = () => {
      const val = customBlockInput.value.trim();
      if (!val) return;
      if (!itemData.customBlocks.includes(val)) {
        itemData.customBlocks.push(val);
        customBlockInput.value = '';
        customBlockForm.classList.add('hidden');
        renderPalette();
        saveBoard();
        if (window.App) window.App.showToast(`Блок "${val}" добавлен в палитру`);
      }
    };

    btnSubmitCustom.addEventListener('pointerdown', e => e.stopPropagation());
    btnSubmitCustom.addEventListener('click', (e) => {
      e.stopPropagation();
      addCustomBlock();
    });
    customBlockInput.addEventListener('pointerdown', e => e.stopPropagation());
    customBlockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomBlock();
      }
    });

    // Render palette
    function renderPalette() {
      paletteEl.innerHTML = '';
      const allTokens = [...DEFAULT_BLOCKS, ...itemData.customBlocks];

      allTokens.forEach(token => {
        const isCustom = itemData.customBlocks.includes(token);
        const pill = document.createElement('div');
        pill.className = `sql-block-pill px-2.5 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer transition shadow-xs border flex items-center gap-1 select-none ${
          isCustom
            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-600 hover:text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-indigo-600 hover:text-white'
        }`;
        pill.setAttribute('draggable', 'true');
        pill.dataset.text = token;

        pill.innerHTML = `
          <span>${token}</span>
          ${isCustom ? `<button type="button" class="btn-del-custom-block text-purple-400 hover:text-rose-500 font-bold ml-0.5 text-xs">×</button>` : ''}
        `;

        // Click to add
        pill.addEventListener('pointerdown', e => e.stopPropagation());
        pill.addEventListener('click', (e) => {
          if (e.target.closest('.btn-del-custom-block')) return;
          e.stopPropagation();
          itemData.slots.push(token);
          renderSlots();
          saveBoard();
        });

        // Drag start
        pill.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', token);
          e.dataTransfer.effectAllowed = 'copy';
        });

        if (isCustom) {
          const delBtn = pill.querySelector('.btn-del-custom-block');
          delBtn.addEventListener('pointerdown', e => e.stopPropagation());
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            itemData.customBlocks = itemData.customBlocks.filter(b => b !== token);
            renderPalette();
            saveBoard();
          });
        }

        paletteEl.appendChild(pill);
      });
    }

    // Dropzone drag & drop listeners
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropzone.classList.add('border-indigo-500', 'bg-indigo-950/30');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/30');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/30');
      const token = e.dataTransfer.getData('text/plain');
      if (token) {
        itemData.slots.push(token);
        renderSlots();
        saveBoard();
      }
    });

    // Render slots in dropzone
    function renderSlots() {
      dropzone.innerHTML = '';
      counterEl.textContent = `${itemData.slots.length} ${itemData.slots.length === 1 ? 'блок' : 'блоков'}`;

      if (itemData.slots.length === 0) {
        dropzone.innerHTML = `<span class="placeholder-text text-slate-500 italic select-none text-xs">Перетащите или нажимайте блоки выше для сборки SQL...</span>`;
        return;
      }

      itemData.slots.forEach((token, idx) => {
        const pill = document.createElement('span');
        pill.className = 'px-2 py-0.5 rounded bg-indigo-900/70 text-indigo-200 border border-indigo-700/60 flex items-center gap-1 cursor-pointer hover:bg-rose-900/60 transition select-none';
        pill.innerHTML = `<span>${token}</span><span class="text-[10px] text-rose-300 font-bold ml-0.5">×</span>`;
        pill.title = 'Нажмите, чтобы убрать блок';

        pill.addEventListener('pointerdown', e => e.stopPropagation());
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          itemData.slots.splice(idx, 1);
          renderSlots();
          saveBoard();
        });

        dropzone.appendChild(pill);
      });
    }

    // Clear slots
    const btnClear = el.querySelector('.btn-clear-slots');
    btnClear.addEventListener('pointerdown', e => e.stopPropagation());
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.slots = [];
      resultsPreview.classList.add('hidden');
      statusText.textContent = '';
      renderSlots();
      saveBoard();
    });

    // Run assembled query
    const btnRun = el.querySelector('.btn-run-assembled');
    btnRun.addEventListener('pointerdown', e => e.stopPropagation());
    btnRun.addEventListener('click', (e) => {
      e.stopPropagation();
      const q = itemData.slots.join(' ').trim();
      if (!q) {
        if (window.App) window.App.showToast('Сначала соберите SQL-запрос из блоков');
        return;
      }

      try {
        const res = DB.executeSQL(q);
        statusText.className = 'builder-status-text text-[11px] font-mono text-emerald-600 font-semibold';
        statusText.textContent = `Успешно (${res.rowCount || 0} строк)`;

        resultsPreview.classList.remove('hidden');
        if (res.rows && res.rows.length > 0) {
          const cols = Object.keys(res.rows[0]);
          resultsPreview.innerHTML = `
            <table class="w-full text-left font-mono">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                  ${cols.map(c => `<th class="p-1">${c}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${res.rows.slice(0, 5).map(r => `
                  <tr class="border-b border-slate-100 dark:border-slate-800/50">
                    ${cols.map(c => `<td class="p-1 text-slate-800 dark:text-slate-200">${r[c] !== null && r[c] !== undefined ? r[c] : 'NULL'}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${res.rows.length > 5 ? `<div class="text-[10px] text-slate-400 mt-1 italic">Показано 5 из ${res.rows.length} строк</div>` : ''}
          `;
        } else {
          resultsPreview.innerHTML = `<div class="p-2 text-slate-500 font-mono text-xs">Запрос выполнен успешно (пустой набор результатов)</div>`;
        }

        if (window.App) window.App.showToast(`Запрос выполнен! Возвращено ${res.rowCount || 0} строк`);
        if (window.confetti) confetti({ particleCount: 20 });
      } catch (err) {
        statusText.className = 'builder-status-text text-[11px] font-mono text-rose-600 font-semibold';
        statusText.textContent = 'Ошибка SQL';
        resultsPreview.classList.remove('hidden');
        resultsPreview.innerHTML = `<div class="p-2 text-rose-600 dark:text-rose-400 font-mono text-xs font-semibold">❌ ${err.message}</div>`;
        if (window.App) window.App.showToast(`Ошибка: ${err.message}`);
      }
    });

    renderPalette();
    renderSlots();

    // Lock & Delete
    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
    });

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  // ==========================================
  // 5. Lesson Progress Checklist Widget
  // ==========================================
  function createChecklistWidget(x, y, itemsList = null, width = 320, height = 320, existingId = null, isLocked = false, title = "Прогресс урока", fromRemote = false) {
    const id = existingId || 'check_' + Date.now();
    const defaultChecklist = [
      { text: '1. Простые SELECT и FROM', status: 'done' },
      { text: '2. Фильтрация WHERE и условия', status: 'done' },
      { text: '3. Логические операторы AND/OR', status: 'progress' },
      { text: '4. Сортировка ORDER BY', status: 'todo' },
      { text: '5. Объединение таблиц JOIN', status: 'todo' }
    ];

    const itemData = {
      id,
      type: 'checklist',
      x,
      y,
      width,
      height,
      title: title || 'Прогресс урока',
      items: itemsList && Array.isArray(itemsList) ? [...itemsList] : defaultChecklist,
      isLocked
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden p-3.5 ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="checklist-handle flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 cursor-grab select-none">
        <div class="flex items-center gap-1.5 flex-1 mr-2">
          <span class="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
            <i data-lucide="list-checks" class="w-3.5 h-3.5"></i>
          </span>
          <input type="text" class="checklist-title-input text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 outline-none px-1 rounded transition w-full" value="${itemData.title}" />
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Заблокировать/Разблокировать">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-delete-item p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition" title="Удалить чеклист">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <!-- Add New Item Input Row -->
      <div class="pt-2 pb-1.5 flex gap-1.5">
        <input type="text" class="new-checklist-input flex-1 px-2.5 py-1 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Новый пункт плана..." />
        <button class="btn-add-checklist-item px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shrink-0 shadow-xs flex items-center gap-1">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
        </button>
      </div>

      <!-- Checklist Items List -->
      <div class="checklist-items-container space-y-1 flex-1 min-h-0 overflow-y-auto py-1 pr-0.5"></div>

      <!-- Progress Footer -->
      <div class="border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
        <div class="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
          <span class="checklist-counter">0 из 0 выполнено</span>
          <span class="checklist-percent font-mono">0%</span>
        </div>
        <div class="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div class="checklist-progress-bar h-full bg-emerald-500 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.checklist-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 260, 220);

    const titleInput = el.querySelector('.checklist-title-input');
    titleInput.addEventListener('pointerdown', e => e.stopPropagation());
    titleInput.addEventListener('input', () => {
      itemData.title = titleInput.value;
      saveBoard();
    });

    const container = el.querySelector('.checklist-items-container');
    const counterEl = el.querySelector('.checklist-counter');
    const percentEl = el.querySelector('.checklist-percent');
    const progressBar = el.querySelector('.checklist-progress-bar');
    const newItemInput = el.querySelector('.new-checklist-input');
    const btnAddItem = el.querySelector('.btn-add-checklist-item');

    function renderItems() {
      container.innerHTML = '';
      const total = itemData.items.length;
      const doneCount = itemData.items.filter(i => i.status === 'done').length;
      const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

      counterEl.textContent = `${doneCount} из ${total} выполнено`;
      percentEl.textContent = `${pct}%`;
      progressBar.style.width = `${pct}%`;

      itemData.items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group select-none';

        let badgeIcon = '⬜';
        let badgeClass = 'text-slate-400 hover:text-slate-600';
        let textClass = 'text-slate-700 dark:text-slate-200';
        if (it.status === 'done') {
          badgeIcon = '✅';
          badgeClass = 'text-emerald-600';
          textClass = 'line-through text-slate-400 dark:text-slate-500';
        } else if (it.status === 'progress') {
          badgeIcon = '🟡';
          badgeClass = 'text-amber-500';
          textClass = 'font-semibold text-amber-700 dark:text-amber-300';
        }

        row.innerHTML = `
          <button type="button" class="btn-toggle-status text-sm ${badgeClass} shrink-0 cursor-pointer p-0.5 rounded hover:scale-110 transition" title="Сменить статус (кликните)">${badgeIcon}</button>
          <input type="text" class="item-text-input flex-1 bg-transparent text-xs ${textClass} outline-none px-1 py-0.5 rounded hover:bg-white/80 dark:hover:bg-slate-800" value="${it.text}" />
          <button type="button" class="btn-del-item text-slate-300 hover:text-rose-500 text-xs px-1 font-bold opacity-0 group-hover:opacity-100 transition shrink-0" title="Удалить пункт">×</button>
        `;

        const btnStatus = row.querySelector('.btn-toggle-status');
        btnStatus.addEventListener('pointerdown', e => e.stopPropagation());
        btnStatus.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.status === 'todo') it.status = 'progress';
          else if (it.status === 'progress') it.status = 'done';
          else it.status = 'todo';
          renderItems();
          saveBoard();
          if (window.Collab) Collab.broadcastItemUpdate(id, { items: itemData.items, title: itemData.title });
        });

        const textInput = row.querySelector('.item-text-input');
        textInput.addEventListener('pointerdown', e => e.stopPropagation());
        textInput.addEventListener('input', () => {
          it.text = textInput.value;
          saveBoard();
          if (window.Collab) Collab.broadcastItemUpdate(id, { items: itemData.items, title: itemData.title });
        });

        const delBtn = row.querySelector('.btn-del-item');
        delBtn.addEventListener('pointerdown', e => e.stopPropagation());
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          itemData.items.splice(idx, 1);
          renderItems();
          saveBoard();
          if (window.Collab) Collab.broadcastItemUpdate(id, { items: itemData.items, title: itemData.title });
        });

        container.appendChild(row);
      });
    }

    el._rerenderWidget = (updatedData) => {
      if (updatedData) Object.assign(itemData, updatedData);
      renderItems();
    };

    const addNewItem = () => {
      const val = newItemInput.value.trim();
      if (!val) return;
      itemData.items.push({ text: val, status: 'todo' });
      newItemInput.value = '';
      renderItems();
      saveBoard();
      if (window.Collab) Collab.broadcastItemUpdate(id, { items: itemData.items, title: itemData.title });
    };

    btnAddItem.addEventListener('pointerdown', e => e.stopPropagation());
    btnAddItem.addEventListener('click', (e) => {
      e.stopPropagation();
      addNewItem();
    });

    newItemInput.addEventListener('pointerdown', e => e.stopPropagation());
    newItemInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNewItem();
      }
    });

    renderItems();

    // Lock & Delete
    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
    });

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  // ==========================================
  // 6. Visual ERD Schema Table Widget & Connectors
  // ==========================================
  function ensureErdSvgLayer() {
    let group = document.getElementById('erd-connectors-group');
    if (!group) {
      const drawingSvg = document.getElementById('drawing-svg-layer');
      if (drawingSvg) {
        group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.id = 'erd-connectors-group';
        drawingSvg.insertBefore(group, drawingSvg.firstChild);
      }
    }
    if (group && window.Canvas) {
      const scale = Canvas.getScale();
      const pan = Canvas.getPan();
      group.setAttribute('transform', `translate(${pan.x}, ${pan.y}) scale(${scale})`);
    }
  }

  function renderErdColumnsHtml(tableInfo) {
    if (!tableInfo.columns || tableInfo.columns.length === 0) {
      return '<div class="text-[11px] text-slate-400 p-3 italic text-center">Нет колонок</div>';
    }
    return tableInfo.columns.map(col => `
      <div class="erd-col-row flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 group transition select-none cursor-pointer relative" 
           data-col="${col.name}" 
           data-table="${tableInfo.name}"
           data-is-pk="${col.isPK ? '1' : '0'}" 
           data-is-fk="${col.isFK ? '1' : '0'}"
           data-fk-target="${col.fkTarget || ''}">
        
        <div class="flex items-center gap-1.5 truncate flex-1 min-w-0 mr-1">
          ${col.isPK ? '<span class="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-1 py-0.5 rounded shadow-2xs shrink-0 flex items-center gap-0.5" title="Primary Key (Первичный ключ)"><span>PK</span><span>🔑</span></span>' : ''}
          ${col.isFK ? `<span class="text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-1 py-0.5 rounded shadow-2xs shrink-0 flex items-center gap-0.5" title="${col.fkTarget ? 'Внешний ключ -> ' + col.fkTarget : 'Внешний ключ'}"><span>FK</span><span>🔗</span></span>` : ''}
          ${col.notNull && !col.isPK ? '<span class="text-[9px] font-mono font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 px-1 py-0.5 rounded shrink-0" title="Обязательное поле (NOT NULL)">NN</span>' : ''}
          ${col.unique && !col.isPK ? '<span class="text-[9px] font-mono font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 px-1 py-0.5 rounded shrink-0" title="Уникальное поле (UNIQUE)">UQ</span>' : ''}
          <span class="text-slate-800 dark:text-slate-200 font-medium truncate">${col.name}</span>
        </div>
        
        <div class="flex items-center gap-1 shrink-0">
          <span class="text-[10px] text-slate-400 uppercase font-mono">${col.type}</span>
          ${!col.isPK ? `
            <button type="button" class="btn-del-erd-col opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-500 rounded transition" title="Удалить колонку ${col.name}">
              <i data-lucide="x" class="w-3 h-3"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  function attachErdCardColumnEvents(cardEl, tableInfo) {
    cardEl.querySelectorAll('.btn-del-erd-col').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rowEl = btn.closest('.erd-col-row');
        const colName = rowEl?.dataset.col;
        if (!colName) return;
        if (confirm(`Удалить колонку "${colName}" из таблицы "${tableInfo.name}"?`)) {
          try {
            DB.dropColumn(tableInfo.name, colName);
            if (window.App) window.App.showToast(`Колонка "${colName}" удалена`);
          } catch (err) {
            if (window.App) window.App.showToast(err.message, true);
          }
        }
      });
    });

    // Interactive Hover on Field Rows to Highlight Constraint Relations
    cardEl.querySelectorAll('.erd-col-row').forEach(row => {
      const colName = row.dataset.col;
      const isFK = row.dataset.isFk === '1';
      const isPK = row.dataset.isPk === '1';

      row.addEventListener('pointerenter', () => {
        if (!isFK && !isPK) return;
        document.querySelectorAll('.erd-rel-group').forEach(relG => {
          const fromCol = relG.dataset.fromCol;
          const toCol = relG.dataset.toCol;
          const fromId = relG.dataset.fromId;
          const toId = relG.dataset.toId;
          const matches = (isFK && relG.dataset.fromTable === tableInfo.name && fromCol === colName) ||
                          (isPK && relG.dataset.toTable === tableInfo.name && toCol === colName);
          if (matches) {
            relG.querySelector('.erd-relation-path')?.classList.add('highlighted');
            document.getElementById(fromId)?.classList.add('erd-table-highlight');
            document.getElementById(toId)?.classList.add('erd-table-highlight');
            document.getElementById(fromId)?.querySelector(`[data-col="${fromCol}"]`)?.classList.add('erd-col-highlight');
            document.getElementById(toId)?.querySelector(`[data-col="${toCol}"]`)?.classList.add('erd-col-highlight');
          }
        });
      });

      row.addEventListener('pointerleave', () => {
        if (!isFK && !isPK) return;
        document.querySelectorAll('.erd-rel-group').forEach(relG => {
          relG.querySelector('.erd-relation-path')?.classList.remove('highlighted');
          const fromId = relG.dataset.fromId;
          const toId = relG.dataset.toId;
          const fromCol = relG.dataset.fromCol;
          const toCol = relG.dataset.toCol;
          document.getElementById(fromId)?.classList.remove('erd-table-highlight');
          document.getElementById(toId)?.classList.remove('erd-table-highlight');
          document.getElementById(fromId)?.querySelector(`[data-col="${fromCol}"]`)?.classList.remove('erd-col-highlight');
          document.getElementById(toId)?.querySelector(`[data-col="${toCol}"]`)?.classList.remove('erd-col-highlight');
        });
      });
    });
  }

  function createErdTableWidget(x, y, tableInfo, existingId = null, fromRemote = false) {
    const id = existingId || 'erd_' + tableInfo.name;
    const schema = DB.getSchemaMetadata();
    const currentInfo = schema[tableInfo.name] || tableInfo;

    const itemData = {
      id,
      type: 'erd_table',
      x,
      y,
      width: 310,
      height: 270,
      tableName: currentInfo.name,
      isLocked: false
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900 shadow-md flex flex-col overflow-hidden`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `310px`;
    el.style.height = `270px`;

    el.innerHTML = `
      <div class="erd-handle flex items-center justify-between px-3 py-2 bg-indigo-50/90 dark:bg-indigo-950/70 border-b border-indigo-100 dark:border-indigo-900 cursor-grab select-none">
        <div class="flex items-center gap-1.5 font-bold text-xs text-indigo-700 dark:text-indigo-300">
          <i data-lucide="table" class="w-3.5 h-3.5"></i>
          <span>${currentInfo.name}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="erd-row-count-badge text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-200/50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">${currentInfo.rowCount} строк</span>
          <button type="button" class="btn-erd-card-add-col p-1 hover:bg-indigo-200/60 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded transition" title="Добавить колонку в ${currentInfo.name}">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" class="btn-erd-card-del-table p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition" title="Удалить таблицу ${currentInfo.name}">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <div class="erd-columns-container flex-1 min-h-0 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
        ${renderErdColumnsHtml(currentInfo)}
      </div>
      <div class="p-1.5 bg-slate-50/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center">
        <button type="button" class="btn-erd-footer-add-col w-full py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition flex items-center justify-center gap-1">
          <i data-lucide="plus" class="w-3 h-3"></i> + Колонка
        </button>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    // Attach actions
    const openAddCol = (e) => {
      e.stopPropagation();
      FloatingWindows.openAddColumnWindow(currentInfo.name);
    };

    const addColBtn = el.querySelector('.btn-erd-card-add-col');
    addColBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
    addColBtn?.addEventListener('click', openAddCol);

    const footerAddColBtn = el.querySelector('.btn-erd-footer-add-col');
    footerAddColBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
    footerAddColBtn?.addEventListener('click', openAddCol);

    const delTableBtn = el.querySelector('.btn-erd-card-del-table');
    delTableBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
    delTableBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Удалить таблицу "${currentInfo.name}" из базы данных?`)) {
        DB.dropTable(currentInfo.name);
      }
    });

    attachErdCardColumnEvents(el, currentInfo);

    const handle = el.querySelector('.erd-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 240, 180);

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    updateErdConnectors();
    return el;
  }

  // Visual ERD Relationships (Connectors Layer with Field-to-Field Linking)
  function updateErdConnectors() {
    ensureErdSvgLayer();
    const group = document.getElementById('erd-connectors-group');
    if (!group) return;

    const erdWidgets = items.filter(i => i.type === 'erd_table');
    if (erdWidgets.length === 0) {
      group.innerHTML = '';
      return;
    }

    const rels = DB.getRelationships();
    let svgContent = '';
    const scale = window.Canvas ? Canvas.getScale() : 1;

    rels.forEach(rel => {
      const fromItem = erdWidgets.find(w => w.tableName === rel.fromTable);
      const toItem = erdWidgets.find(w => w.tableName === rel.toTable);
      if (!fromItem || !toItem) return;

      const fromEl = document.getElementById(fromItem.id);
      const toEl = document.getElementById(toItem.id);
      if (!fromEl || !toEl) return;

      const fromColEl = fromEl.querySelector(`[data-col="${rel.fromCol}"]`);
      const toColEl = toEl.querySelector(`[data-col="${rel.toCol}"]`);

      const fromCardRect = fromEl.getBoundingClientRect();
      const fromColRect = fromColEl ? fromColEl.getBoundingClientRect() : null;
      let fromY = fromItem.y + (fromColRect ? Math.round((fromColRect.top - fromCardRect.top + fromColRect.height / 2) / scale) : 70);

      const toCardRect = toEl.getBoundingClientRect();
      const toColRect = toColEl ? toColEl.getBoundingClientRect() : null;
      let toY = toItem.y + (toColRect ? Math.round((toColRect.top - toCardRect.top + toColRect.height / 2) / scale) : 50);

      fromY = Math.max(fromItem.y + 16, Math.min(fromItem.y + fromItem.height - 16, fromY));
      toY = Math.max(toItem.y + 16, Math.min(toItem.y + toItem.height - 16, toY));

      let startX, endX, cp1X, cp1Y, cp2X, cp2Y;
      const fromRight = fromItem.x + fromItem.width;
      const toRight = toItem.x + toItem.width;

      const fromCenter = fromItem.x + fromItem.width / 2;
      const toCenter = toItem.x + toItem.width / 2;

      if (fromCenter <= toCenter) {
        // Child is on left, Parent is on right
        startX = fromRight;
        endX = toItem.x;
        const dist = Math.max(45, Math.abs(endX - startX) * 0.45);
        cp1X = startX + dist;
        cp1Y = fromY;
        cp2X = endX - dist;
        cp2Y = toY;
      } else {
        // Child is on right, Parent is on left
        startX = fromItem.x;
        endX = toRight;
        const dist = Math.max(45, Math.abs(startX - endX) * 0.45);
        cp1X = startX - dist;
        cp1Y = fromY;
        cp2X = endX + dist;
        cp2Y = toY;
      }

      // If cards are vertically aligned / overlapping in X
      if (Math.abs(startX - endX) < 35) {
        if (fromCenter > 200 && toCenter > 200) {
          startX = fromItem.x;
          endX = toItem.x;
          const loopX = Math.min(fromItem.x, toItem.x) - 50;
          cp1X = loopX; cp1Y = fromY;
          cp2X = loopX; cp2Y = toY;
        } else {
          startX = fromRight;
          endX = toRight;
          const loopX = Math.max(fromRight, toRight) + 50;
          cp1X = loopX; cp1Y = fromY;
          cp2X = loopX; cp2Y = toY;
        }
      }

      const pathData = `M ${startX} ${fromY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${toY}`;

      const badge1X = Math.round(endX + (startX > endX ? 16 : -16));
      const badge1Y = Math.round(toY - 6);
      const badgeNX = Math.round(startX + (endX > startX ? 16 : -16));
      const badgeNY = Math.round(fromY - 6);

      svgContent += `
        <g class="erd-rel-group group pointer-events-auto cursor-pointer" data-rel-id="${rel.id}" data-from-id="${fromItem.id}" data-to-id="${toItem.id}" data-from-table="${rel.fromTable}" data-to-table="${rel.toTable}" data-from-col="${rel.fromCol}" data-to-col="${rel.toCol}">
          <path d="${pathData}" fill="none" stroke="transparent" stroke-width="22" class="erd-hit-path" />
          <path d="${pathData}" fill="none" stroke="#6366f1" stroke-width="2.5" marker-end="url(#erd-arrow-head)" class="erd-relation-path" />
          
          <!-- Explicit Anchor Pins on Field Rows -->
          <circle cx="${startX}" cy="${fromY}" r="5" fill="#10b981" stroke="#ffffff" stroke-width="2" class="erd-origin-dot" title="${rel.fromTable}.${rel.fromCol} (FK)" />
          <circle cx="${endX}" cy="${toY}" r="5" fill="#6366f1" stroke="#ffffff" stroke-width="2" class="erd-target-dot" title="${rel.toTable}.${rel.toCol} (PK)" />

          <!-- Multiplicity Badges: 1 on PK, N on FK -->
          <circle cx="${badge1X}" cy="${badge1Y}" r="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5" />
          <text x="${badge1X}" y="${badge1Y + 3.5}" font-size="9" fill="#92400e" font-weight="bold" text-anchor="middle" class="erd-badge-text">1</text>
          <circle cx="${badgeNX}" cy="${badgeNY}" r="8" fill="#d1fae5" stroke="#10b981" stroke-width="1.5" />
          <text x="${badgeNX}" y="${badgeNY + 3.5}" font-size="9" fill="#065f46" font-weight="bold" text-anchor="middle" class="erd-badge-text">N</text>
        </g>
      `;
    });

    group.innerHTML = svgContent;

    group.querySelectorAll('.erd-rel-group').forEach(relG => {
      const fromId = relG.dataset.fromId;
      const toId = relG.dataset.toId;
      const fromCol = relG.dataset.fromCol;
      const toCol = relG.dataset.toCol;
      const visiblePath = relG.querySelector('.erd-relation-path');

      const onEnter = () => {
        visiblePath?.classList.add('highlighted');
        const fromEl = document.getElementById(fromId);
        const toEl = document.getElementById(toId);
        fromEl?.classList.add('erd-table-highlight');
        toEl?.classList.add('erd-table-highlight');
        fromEl?.querySelector(`[data-col="${fromCol}"]`)?.classList.add('erd-col-highlight');
        toEl?.querySelector(`[data-col="${toCol}"]`)?.classList.add('erd-col-highlight');
      };

      const onLeave = () => {
        visiblePath?.classList.remove('highlighted');
        const fromEl = document.getElementById(fromId);
        const toEl = document.getElementById(toId);
        fromEl?.classList.remove('erd-table-highlight');
        toEl?.classList.remove('erd-table-highlight');
        fromEl?.querySelector(`[data-col="${fromCol}"]`)?.classList.remove('erd-col-highlight');
        toEl?.querySelector(`[data-col="${toCol}"]`)?.classList.remove('erd-col-highlight');
      };

      relG.addEventListener('pointerenter', onEnter);
      relG.addEventListener('pointerleave', onLeave);
    });
  }

  function refreshErdWidgets(eventData) {
    const erdWidgets = items.filter(i => i.type === 'erd_table');
    const isErdPage = window.Pages && Pages.getActivePage() && Pages.getActivePage().type === 'erd';

    if (erdWidgets.length === 0 && !isErdPage) {
      return;
    }

    const schema = DB.getSchemaMetadata();
    const tableNames = Object.keys(schema);

    // 1. Update existing ERD cards or purge dropped
    erdWidgets.forEach(item => {
      if (!schema[item.tableName]) {
        deleteItem(item.id);
      } else {
        const el = document.getElementById(item.id);
        if (el) {
          const tableInfo = schema[item.tableName];
          const countBadge = el.querySelector('.erd-row-count-badge');
          if (countBadge) countBadge.textContent = `${tableInfo.rowCount} строк`;

          const colsContainer = el.querySelector('.erd-columns-container');
          if (colsContainer) {
            colsContainer.innerHTML = renderErdColumnsHtml(tableInfo);
            lucide.createIcons();
            attachErdCardColumnEvents(el, tableInfo);
          }
        }
      }
    });

    // 2. Add newly created tables to ERD
    if (isErdPage || erdWidgets.length > 0) {
      const currentErds = items.filter(i => i.type === 'erd_table');
      let rightMostX = currentErds.reduce((max, it) => Math.max(max, it.x + it.width), 60);

      tableNames.forEach(tName => {
        if (!items.some(i => i.type === 'erd_table' && i.tableName === tName)) {
          createErdTableWidget(rightMostX + 40, 80, schema[tName]);
          rightMostX += 340;
        }
      });
    }

    // 3. Recalculate connectors
    updateErdConnectors();
    saveBoard();
  }

  // ==========================================
  // 7. General SQL Scratchpad Widget
  // ==========================================
  function createSqlWidget(x, y, title = "SQL Скретчпад", query = null, width = 560, height = 480, existingId = null, isLocked = false, fromRemote = false) {
    const id = existingId || 'sql_' + Date.now();
    const initialQuery = query || "SELECT * FROM students;";

    const itemData = {
      id,
      type: 'sql',
      x,
      y,
      width,
      height,
      title,
      query: initialQuery,
      isLocked
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="sql-handle flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 cursor-grab select-none">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <i data-lucide="terminal-square" class="w-3.5 h-3.5"></i>
          </div>
          <input type="text" class="sql-title-input text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none px-1 rounded transition" value="${title}" />
        </div>
        <div class="flex items-center gap-1.5">
          <span class="sql-exec-time text-[10px] text-slate-400 font-mono hidden">0ms</span>
          <button class="btn-lock-toggle p-1 rounded hover:bg-black/10 transition" title="Lock">
            <i data-lucide="${isLocked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="btn-delete-item p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition" title="Удалить">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="flex flex-col flex-1 min-h-0 bg-slate-950 text-slate-100">
        <div class="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="font-mono text-[10px] uppercase tracking-wider text-slate-400">ANSI SQL (AlaSQL)</span>
          </div>
          <button class="btn-run-sql flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition active:scale-95 shadow-sm shadow-indigo-500/30">
            <i data-lucide="play" class="w-3.5 h-3.5 fill-white"></i>
            <span>Выполнить (Ctrl+Enter)</span>
          </button>
        </div>

        <div class="h-32 flex-shrink-0 bg-slate-950">
          <textarea class="sql-editor-textarea w-full h-full p-3 bg-transparent text-emerald-300 font-mono text-xs outline-none resize-none leading-relaxed border-none" spellcheck="false">${initialQuery}</textarea>
        </div>

        <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between px-3.5 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px]">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-slate-700 dark:text-slate-200">Результаты</span>
              <span class="sql-row-count px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-mono">0 строк</span>
            </div>
            <div class="flex items-center gap-1">
              <button class="btn-export-csv text-[11px] text-slate-600 dark:text-slate-300 hover:text-indigo-600 font-medium px-2 py-0.5 rounded hover:bg-slate-200/50 transition flex items-center gap-1">
                <i data-lucide="file-spreadsheet" class="w-3 h-3"></i> CSV
              </button>
            </div>
          </div>

          <div class="sql-results-viewport flex-1 overflow-auto p-2 text-xs font-mono">
            <div class="sql-placeholder text-center py-8 text-slate-400 italic">
              Нажмите «Выполнить» или Ctrl+Enter
            </div>
            <table class="sql-data-table w-full text-left border-collapse hidden">
              <thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                <tr class="table-header-row"></tr>
              </thead>
              <tbody class="table-body divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300"></tbody>
            </table>
            <div class="sql-mutation-card hidden p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
              <i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>
              <span class="sql-mutation-text"></span>
            </div>
            <div class="sql-error-box hidden p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono"></div>
          </div>
        </div>
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.sql-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 420, 340);

    const codeEditor = el.querySelector('.sql-editor-textarea');
    codeEditor.addEventListener('input', () => {
      itemData.query = codeEditor.value;
      saveBoard();
      if (window.Collab) Collab.broadcastItemText(id, 'query', codeEditor.value);
    });

    const btnRun = el.querySelector('.btn-run-sql');
    const tableEl = el.querySelector('.sql-data-table');
    const placeholderEl = el.querySelector('.sql-placeholder');
    const mutationCard = el.querySelector('.sql-mutation-card');
    const mutationText = el.querySelector('.sql-mutation-text');
    const errorBox = el.querySelector('.sql-error-box');
    const rowCountEl = el.querySelector('.sql-row-count');
    const execTimeEl = el.querySelector('.sql-exec-time');

    let lastResultRows = [];

    function runQuery() {
      const q = codeEditor.value;
      if (!q.trim()) return;

      const t0 = performance.now();
      try {
        const res = DB.executeSQL(q);
        const elapsed = (performance.now() - t0).toFixed(1);

        execTimeEl.textContent = `${elapsed}ms`;
        execTimeEl.classList.remove('hidden');
        errorBox.classList.add('hidden');
        placeholderEl.classList.add('hidden');

        if (res.isMutation) {
          tableEl.classList.add('hidden');
          mutationCard.classList.remove('hidden');
          mutationText.textContent = res.message;
          rowCountEl.textContent = `${res.affectedRows} зап.`;
          lastResultRows = [];
        } else {
          mutationCard.classList.add('hidden');
          tableEl.classList.remove('hidden');
          lastResultRows = res.rows || [];
          rowCountEl.textContent = `${lastResultRows.length} строк`;

          const thead = el.querySelector('.table-header-row');
          const tbody = el.querySelector('.table-body');
          thead.innerHTML = '';
          tbody.innerHTML = '';

          if (lastResultRows.length === 0) {
            thead.innerHTML = '<th class="p-2 text-slate-400">Результат пуст</th>';
            tbody.innerHTML = '<tr><td class="p-3 text-slate-400 text-center">Запрос выполнен, 0 записей</td></tr>';
            return;
          }

          const cols = Object.keys(lastResultRows[0]);
          cols.forEach(col => {
            const th = document.createElement('th');
            th.className = 'py-2 px-3 font-semibold text-[11px] whitespace-nowrap';
            th.textContent = col;
            thead.appendChild(th);
          });

          lastResultRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors';
            cols.forEach(col => {
              const td = document.createElement('td');
              td.className = 'py-1.5 px-3 whitespace-nowrap';
              const val = row[col];
              td.textContent = (val !== null && val !== undefined) ? val : 'NULL';
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
        }
      } catch (err) {
        tableEl.classList.add('hidden');
        placeholderEl.classList.add('hidden');
        mutationCard.classList.add('hidden');
        errorBox.classList.remove('hidden');
        errorBox.textContent = `Ошибка SQL: ${err.message || err}`;
        rowCountEl.textContent = 'ошибка';
      }
    }

    el._runQuery = runQuery;
    btnRun.addEventListener('pointerdown', e => e.stopPropagation());
    btnRun.addEventListener('click', (e) => {
      e.stopPropagation();
      runQuery();
    });

    codeEditor.addEventListener('pointerdown', e => e.stopPropagation());
    codeEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    });

    const titleInput = el.querySelector('.sql-title-input');
    titleInput.addEventListener('pointerdown', e => e.stopPropagation());
    titleInput.addEventListener('input', () => {
      itemData.title = titleInput.value;
      saveBoard();
    });

    const btnLock = el.querySelector('.btn-lock-toggle');
    btnLock.addEventListener('pointerdown', e => e.stopPropagation());
    btnLock.addEventListener('click', (e) => {
      e.stopPropagation();
      itemData.isLocked = !itemData.isLocked;
      updateItemLockUI(id, itemData.isLocked);
      saveBoard();
    });

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    setTimeout(runQuery, 50);
    saveBoard();
    return el;
  }

  // ==========================================
  // 8. Image Component
  // ==========================================
  function createImage(x, y, src, width = 360, height = 250, existingId = null, isLocked = false, fromRemote = false) {
    const id = existingId || 'img_' + Date.now();

    const itemData = {
      id,
      type: 'image',
      x,
      y,
      width,
      height,
      src,
      isLocked
    };

    registerItem(itemData);
    if (!fromRemote && window.Collab) {
      Collab.broadcastItemCreate(itemData);
    }

    const worldLayer = document.getElementById('world-layer');
    const el = document.createElement('div');
    el.id = id;
    el.className = `board-item absolute rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col ${isLocked ? 'locked' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    el.innerHTML = `
      <div class="img-handle flex items-center justify-between px-3 py-1.5 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 cursor-grab select-none">
        <div class="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
          <i data-lucide="image" class="w-3.5 h-3.5"></i>
          <span>Изображение</span>
        </div>
        <button class="btn-delete-item p-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <div class="flex-1 w-full h-full relative overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <img src="${src}" class="w-full h-full object-contain pointer-events-none select-none" />
      </div>
    `;

    worldLayer.appendChild(el);
    lucide.createIcons();

    const handle = el.querySelector('.img-handle');
    attachDraggable(el, handle, itemData);
    attach8WayResizable(el, itemData, 180, 140);

    const btnDelete = el.querySelector('.btn-delete-item');
    btnDelete.addEventListener('pointerdown', e => e.stopPropagation());
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(id);
    });

    el.addEventListener('pointerdown', () => selectItem(id));
    saveBoard();
    return el;
  }

  function triggerImageUpload(x, y) {
    const input = document.getElementById('image-file-input');
    if (!input) return;

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          createImage(x, y, evt.target.result);
          if (window.App) window.App.showToast('Изображение добавлено');
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    };
    input.click();
  }

  function saveBoard() {
    if (window.Pages) Pages.saveCurrentPageState();
    if (window.App) window.App.saveState();
  }

  function clearAll() {
    items = [];
    selectedId = null;
    const worldLayer = document.getElementById('world-layer');
    if (worldLayer) {
      worldLayer.querySelectorAll('.board-item').forEach(el => el.remove());
    }
    const group = document.getElementById('erd-connectors-group');
    if (group) group.innerHTML = '';
  }

  function loadItems(loadedItems) {
    clearAll();
    if (!loadedItems) return;
    loadedItems.forEach(item => {
      if (item.type === 'sticky') {
        createSticky(item.x, item.y, item.content, item.theme || item.color, item.width, item.height, item.id, item.isLocked);
      } else if (item.type === 'sql') {
        createSqlWidget(item.x, item.y, item.title, item.query, item.width, item.height, item.id, item.isLocked);
      } else if (item.type === 'assignment') {
        createAssignmentWidget(item.x, item.y, item.title, item.prompt, item.expectedQuery, item.query, item.width, item.height, item.id, item.isLocked, item.attempts, item.comments);
      } else if (item.type === 'quiz') {
        createQuizWidget(item.x, item.y, item.question, item.options, item.correctIdx, item.explanation, item.width, item.height, item.id, item.isLocked, item.selectedIndex);
      } else if (item.type === 'sql_builder') {
        createSqlBuilderWidget(item.x, item.y, item.slots, item.customBlocks, item.width, item.height, item.id, item.isLocked);
      } else if (item.type === 'checklist') {
        createChecklistWidget(item.x, item.y, item.items, item.width, item.height, item.id, item.isLocked, item.title);
      } else if (item.type === 'erd_table') {
        const schema = DB.getSchemaMetadata();
        const tableInfo = schema[item.tableName] || { name: item.tableName, columns: [], rowCount: 0 };
        createErdTableWidget(item.x, item.y, tableInfo, item.id);
      } else if (item.type === 'image') {
        createImage(item.x, item.y, item.src, item.width, item.height, item.id, item.isLocked);
      }
    });
    updateErdConnectors();
  }

  function mountRemoteItem(item) {
    if (!item || !item.id) return;
    const wasRestoring = restoringItems;
    restoringItems = true;
    try {
    const existing = items.find(i => i.id === item.id);
    if (existing) return;
    if (item.type === 'sticky') {
      createSticky(item.x, item.y, item.content, item.theme || item.color, item.width, item.height, item.id, item.isLocked, true);
    } else if (item.type === 'sql') {
      createSqlWidget(item.x, item.y, item.title, item.query, item.width, item.height, item.id, item.isLocked, true);
    } else if (item.type === 'assignment') {
      createAssignmentWidget(item.x, item.y, item.title, item.prompt, item.expectedQuery, item.query, item.width, item.height, item.id, item.isLocked, item.attempts, item.comments, true);
    } else if (item.type === 'quiz') {
      createQuizWidget(item.x, item.y, item.question, item.options, item.correctIdx, item.explanation, item.width, item.height, item.id, item.isLocked, item.selectedIndex, true);
    } else if (item.type === 'sql_builder') {
      createSqlBuilderWidget(item.x, item.y, item.slots, item.customBlocks, item.width, item.height, item.id, item.isLocked, true);
    } else if (item.type === 'checklist') {
      createChecklistWidget(item.x, item.y, item.items, item.width, item.height, item.id, item.isLocked, item.title, true);
    } else if (item.type === 'erd_table') {
      const schema = DB.getSchemaMetadata();
      const tableInfo = schema[item.tableName] || { name: item.tableName, columns: [], rowCount: 0 };
      createErdTableWidget(item.x, item.y, tableInfo, item.id, true);
    } else if (item.type === 'image') {
      createImage(item.x, item.y, item.src, item.width, item.height, item.id, item.isLocked, true);
    }
    updateErdConnectors();
    if (window.Pages) Pages.saveCurrentPageState();
  }

  function updateRemoteItemText(id, field, value) {
    let item = items.find(i => i.id === id);
    let el = document.getElementById(id);

    // Fallback if item IDs were created before seed normalization
    if (!item && field === 'content') {
      item = items.find(i => i.type === 'sticky');
      if (item) el = document.getElementById(item.id);
    } else if (!item && field === 'query') {
      item = items.find(i => i.type === 'sql' || i.type === 'assignment');
      if (item) el = document.getElementById(item.id);
    }

    if (item) {
      item[field] = value;
    }
    if (!el) return;

    if (field === 'content') {
      const ta = el.querySelector('.sticky-textarea');
      if (ta && document.activeElement !== ta) ta.value = value;
    } else if (field === 'query') {
      const ta = el.querySelector('.sql-editor-textarea') || el.querySelector('.task-sql-editor');
      if (ta && document.activeElement !== ta) ta.value = value;
    } else if (field === 'title') {
      const ti = el.querySelector('.task-title-input');
      if (ti && document.activeElement !== ti) ti.value = value;
    } else if (field === 'prompt') {
      const pi = el.querySelector('.task-prompt-input');
      if (pi && document.activeElement !== pi) pi.value = value;
    } else if (field === 'expectedQuery') {
      const eq = el.querySelector('.task-expected-editor');
      if (eq && document.activeElement !== eq) eq.value = value;
    }
    if (window.Pages) Pages.saveCurrentPageState(false);
  }

  function updateRemoteItemPos(id, x, y, width, height) {
    const item = items.find(i => i.id === id);
    if (item) {
      item.x = x;
      item.y = y;
      if (width) item.width = width;
      if (height) item.height = height;
    }
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (width) el.style.width = `${width}px`;
    if (height) el.style.height = `${height}px`;
    if (item && item.type === 'erd_table') {
      updateErdConnectors();
    }
  }

  function deleteRemoteItem(id) {
    items = items.filter(i => i.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    updateErdConnectors();
    if (window.Pages) Pages.saveCurrentPageState(false);
  }

  function lockRemoteItem(id, isLocked) {
    const item = items.find(i => i.id === id);
    if (item) item.isLocked = isLocked;
    updateItemLockUI(id, isLocked);
    if (window.Pages) Pages.saveCurrentPageState(false);
  }

  function updateRemoteItemData(id, data) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    Object.assign(item, data);
    const el = document.getElementById(id);
    if (el && el._rerenderWidget) {
      el._rerenderWidget(item);
    }
    if (window.Pages) Pages.saveCurrentPageState(false);
  }

  function syncItemsFromState(newItems) {
    if (!Array.isArray(newItems)) return;

    const newItemIds = new Set(newItems.map(i => i.id));

    // 1. Remove elements that no longer exist
    items.forEach(it => {
      if (!newItemIds.has(it.id)) {
        const el = document.getElementById(it.id);
        if (el) el.remove();
      }
    });
    items = items.filter(it => newItemIds.has(it.id));

    // 2. Add or update items
    newItems.forEach(newItem => {
      const existing = items.find(i => i.id === newItem.id);
      const el = document.getElementById(newItem.id);

      if (!existing || !el) {
        // Mount new item
        mountRemoteItem(newItem);
      } else {
        // Update existing item in place
        Object.assign(existing, newItem);

        // Update position and size
        el.style.left = `${newItem.x}px`;
        el.style.top = `${newItem.y}px`;
        if (newItem.width) el.style.width = `${newItem.width}px`;
        if (newItem.height) el.style.height = `${newItem.height}px`;

        // Update content if not currently focused
        if (newItem.type === 'sticky') {
          const ta = el.querySelector('.sticky-textarea');
          if (ta && document.activeElement !== ta && ta.value !== newItem.content) {
            ta.value = newItem.content || '';
          }
        } else if (newItem.type === 'sql') {
          const ta = el.querySelector('.sql-editor-textarea');
          if (ta && document.activeElement !== ta && ta.value !== newItem.query) {
            ta.value = newItem.query || '';
          }
        } else if (newItem.type === 'assignment') {
          const ta = el.querySelector('.task-sql-editor');
          if (ta && document.activeElement !== ta && ta.value !== newItem.query) {
            ta.value = newItem.query || '';
          }
          const promptInp = el.querySelector('.task-prompt-input');
          if (promptInp && document.activeElement !== promptInp && promptInp.value !== newItem.prompt) {
            promptInp.value = newItem.prompt || '';
          }
        } else if (el._rerenderWidget) {
          el._rerenderWidget(newItem);
        }
      }
    });

    updateErdConnectors();
  }

  return {
    init,
    getItems: () => items,
    createSticky,
    createSqlWidget,
    createAssignmentWidget,
    createQuizWidget,
    createSqlBuilderWidget,
    createChecklistWidget,
    createErdTableWidget,
    updateErdConnectors,
    refreshErdWidgets,
    createImage,
    triggerImageUpload,
    selectItem,
    deselectAll,
    deleteItem,
    clearAll,
    loadItems,
    updateItemLockUI,
    mountRemoteItem,
    updateRemoteItemText,
    updateRemoteItemPos,
    deleteRemoteItem,
    lockRemoteItem,
    updateRemoteItemData,
    syncItemsFromState
  };
})();

window.Widgets = Widgets;
