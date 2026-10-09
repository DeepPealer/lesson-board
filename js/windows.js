/**
 * =========================================================
 * MiroSQL Studio - Non-Modal Floating Windows Manager
 * Windows for Creating Tables & Adding Columns without modals
 * =========================================================
 */

const FloatingWindows = (() => {
  let highestZIndex = 60;
  let createTableWinEl = null;
  let addColWinEl = null;

  function getContainer() {
    let container = document.getElementById('floating-windows-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'floating-windows-container';
      container.className = 'pointer-events-none fixed inset-0 z-50 overflow-hidden';
      document.body.appendChild(container);
    }
    return container;
  }

  function bringToFront(el) {
    if (!el) return;
    highestZIndex += 2;
    el.style.zIndex = highestZIndex;
  }

  function attachWindowDraggable(winEl, handleEl) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handleEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('input')) return;
      e.stopPropagation();

      bringToFront(winEl);
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = winEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      handleEl.setPointerCapture(e.pointerId);
    });

    handleEl.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // Clamp to screen bounds
      newLeft = Math.max(10, Math.min(window.innerWidth - winEl.offsetWidth - 10, newLeft));
      newTop = Math.max(10, Math.min(window.innerHeight - winEl.offsetHeight - 10, newTop));

      winEl.style.left = `${newLeft}px`;
      winEl.style.top = `${newTop}px`;
      winEl.style.right = 'auto';
      winEl.style.bottom = 'auto';
      winEl.style.transform = 'none';
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try { handleEl.releasePointerCapture(e.pointerId); } catch (err) {}
    };

    handleEl.addEventListener('pointerup', endDrag);
    handleEl.addEventListener('pointercancel', endDrag);

    winEl.addEventListener('pointerdown', () => bringToFront(winEl));
  }

  // ==========================================
  // 1. Create Table Floating Window
  // ==========================================
  function openCreateTableWindow() {
    const container = getContainer();

    if (createTableWinEl) {
      createTableWinEl.classList.remove('hidden');
      bringToFront(createTableWinEl);
      const input = createTableWinEl.querySelector('#cw-table-name');
      if (input) input.focus();
      return;
    }

    const win = document.createElement('div');
    win.id = 'floating-create-table-win';
    win.className = 'floating-window pointer-events-auto absolute w-[440px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-indigo-200/90 dark:border-indigo-900/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 transition-all';
    
    // Position slightly offset from center
    const initialLeft = Math.max(20, Math.round((window.innerWidth - 440) / 2) - 60);
    const initialTop = Math.max(70, Math.round((window.innerHeight - 520) / 2));
    win.style.left = `${initialLeft}px`;
    win.style.top = `${initialTop}px`;
    bringToFront(win);

    win.innerHTML = `
      <!-- Draggable Header -->
      <div class="floating-window-handle flex items-center justify-between px-4 py-3 bg-indigo-50/90 dark:bg-indigo-950/70 border-b border-indigo-100 dark:border-indigo-900/60 cursor-move select-none">
        <div class="flex items-center gap-2 font-bold text-xs text-indigo-700 dark:text-indigo-300">
          <div class="p-1 rounded-lg bg-indigo-600 text-white shadow-xs">
            <i data-lucide="plus-square" class="w-3.5 h-3.5"></i>
          </div>
          <span>Создание новой таблицы</span>
        </div>
        <button class="btn-win-close p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition" title="Закрыть">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Window Content -->
      <div class="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
        <!-- Error Banner -->
        <div id="cw-error-banner" class="hidden text-xs py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2">
          <i data-lucide="alert-circle" class="w-4 h-4 shrink-0"></i>
          <span class="error-text"></span>
        </div>

        <!-- Table Name Input -->
        <div>
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Имя таблицы (латиница)</label>
          <div class="relative">
            <input type="text" id="cw-table-name" placeholder="например: teachers, orders, books" class="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 dark:text-white placeholder:text-slate-400" />
          </div>
        </div>

        <!-- Quick Presets -->
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Быстрые шаблоны:</span>
          <div class="flex flex-wrap gap-1.5" id="cw-presets-container">
            <button type="button" data-preset="teachers" class="preset-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition border border-slate-200/60 dark:border-slate-700">👥 Преподаватели</button>
            <button type="button" data-preset="departments" class="preset-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition border border-slate-200/60 dark:border-slate-700">🏢 Кафедры</button>
            <button type="button" data-preset="assignments" class="preset-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition border border-slate-200/60 dark:border-slate-700">📝 Задания</button>
            <button type="button" data-preset="orders" class="preset-btn text-[11px] font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition border border-slate-200/60 dark:border-slate-700">📦 Заказы</button>
          </div>
        </div>

        <!-- Columns Structure -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Структура колонок</label>
            <button type="button" id="cw-btn-add-col-row" class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i> Добавить поле
            </button>
          </div>

          <div class="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-900/40" id="cw-columns-list">
            <!-- Row 1: ID (Locked PK) -->
            <div class="flex items-center gap-2 py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              <span class="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded shadow-2xs">PK</span>
              <input type="text" value="id" disabled class="flex-1 text-xs font-mono font-bold text-slate-500 bg-transparent" />
              <span class="text-[10px] font-mono font-semibold text-slate-400 uppercase">INT</span>
              <div class="w-4"></div>
            </div>

            <!-- Row 2: Name (Default) -->
            <div class="col-row flex items-center gap-2 py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              <input type="text" placeholder="имя колонки" value="name" class="col-name-input flex-1 text-xs font-mono rounded bg-slate-50 dark:bg-slate-900/60 px-2 py-1 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500" />
              <select class="col-type-select text-[11px] font-mono rounded bg-slate-50 dark:bg-slate-900/60 px-2 py-1 border border-slate-200 dark:border-slate-700">
                <option value="STRING" selected>STRING</option>
                <option value="INT">INT</option>
                <option value="FLOAT">FLOAT</option>
                <option value="BOOLEAN">BOOLEAN</option>
              </select>
              <button type="button" class="btn-del-col-row p-1 text-slate-400 hover:text-rose-500 rounded transition" title="Удалить поле">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
        <button type="button" class="btn-win-cancel px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl transition">
          Отмена
        </button>
        <button type="button" id="cw-btn-submit" class="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition shadow-indigo-500/20 flex items-center gap-1.5">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>Создать таблицу</span>
        </button>
      </div>
    `;

    container.appendChild(win);
    createTableWinEl = win;
    lucide.createIcons();

    const handle = win.querySelector('.floating-window-handle');
    attachWindowDraggable(win, handle);

    // Close and Cancel
    const closeWin = (e) => {
      if (e) e.stopPropagation();
      win.classList.add('hidden');
    };
    const btnClose = win.querySelector('.btn-win-close');
    btnClose.addEventListener('pointerdown', e => e.stopPropagation());
    btnClose.addEventListener('click', closeWin);

    const btnCancel = win.querySelector('.btn-win-cancel');
    btnCancel.addEventListener('pointerdown', e => e.stopPropagation());
    btnCancel.addEventListener('click', closeWin);

    // Error helper
    const showError = (msg) => {
      const banner = win.querySelector('#cw-error-banner');
      banner.querySelector('.error-text').textContent = msg;
      banner.classList.remove('hidden');
    };
    const hideError = () => {
      win.querySelector('#cw-error-banner').classList.add('hidden');
    };

    // Add Column Row Helper
    const colList = win.querySelector('#cw-columns-list');
    const addColRow = (nameVal = '', typeVal = 'STRING') => {
      const row = document.createElement('div');
      row.className = 'col-row flex items-center gap-2 py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700';
      row.innerHTML = `
        <input type="text" placeholder="имя колонки" value="${nameVal}" class="col-name-input flex-1 text-xs font-mono rounded bg-slate-50 dark:bg-slate-900/60 px-2 py-1 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500" />
        <select class="col-type-select text-[11px] font-mono rounded bg-slate-50 dark:bg-slate-900/60 px-2 py-1 border border-slate-200 dark:border-slate-700">
          <option value="STRING" ${typeVal === 'STRING' ? 'selected' : ''}>STRING</option>
          <option value="INT" ${typeVal === 'INT' ? 'selected' : ''}>INT</option>
          <option value="FLOAT" ${typeVal === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
          <option value="BOOLEAN" ${typeVal === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
        </select>
        <button type="button" class="btn-del-col-row p-1 text-slate-400 hover:text-rose-500 rounded transition" title="Удалить поле">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
      colList.appendChild(row);
      lucide.createIcons();
      row.querySelector('.btn-del-col-row').addEventListener('click', () => row.remove());
      const input = row.querySelector('.col-name-input');
      input.focus();
    };

    win.querySelector('#cw-btn-add-col-row').addEventListener('click', () => {
      addColRow();
    });

    // Preset handlers
    const PRESETS = {
      teachers: {
        name: 'teachers',
        cols: [
          { name: 'name', type: 'STRING' },
          { name: 'department', type: 'STRING' },
          { name: 'email', type: 'STRING' },
          { name: 'salary', type: 'INT' }
        ]
      },
      departments: {
        name: 'departments',
        cols: [
          { name: 'title', type: 'STRING' },
          { name: 'faculty', type: 'STRING' },
          { name: 'building_num', type: 'INT' }
        ]
      },
      assignments: {
        name: 'assignments',
        cols: [
          { name: 'title', type: 'STRING' },
          { name: 'course_id', type: 'INT' },
          { name: 'max_score', type: 'INT' },
          { name: 'deadline', type: 'STRING' }
        ]
      },
      orders: {
        name: 'orders',
        cols: [
          { name: 'student_id', type: 'INT' },
          { name: 'amount', type: 'FLOAT' },
          { name: 'status', type: 'STRING' }
        ]
      }
    };

    win.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pKey = btn.dataset.preset;
        const preset = PRESETS[pKey];
        if (!preset) return;
        win.querySelector('#cw-table-name').value = preset.name;
        // Keep ID row, clear other rows
        const customRows = colList.querySelectorAll('.col-row');
        customRows.forEach(r => r.remove());
        preset.cols.forEach(c => addColRow(c.name, c.type));
        hideError();
      });
    });

    // Submit Action
    win.querySelector('#cw-btn-submit').addEventListener('click', () => {
      hideError();
      const rawName = win.querySelector('#cw-table-name').value.trim();
      const tableName = rawName.toLowerCase().replace(/\s+/g, '_');

      if (!tableName) {
        showError('Введите имя таблицы!');
        return;
      }

      if (DB.getTables()[tableName]) {
        showError(`Таблица "${tableName}" уже существует!`);
        return;
      }

      const columnDefs = [{ name: 'id', type: 'INT' }];
      const rows = colList.querySelectorAll('.col-row');
      const seenNames = new Set(['id']);

      for (let r of rows) {
        const cName = r.querySelector('.col-name-input').value.trim().toLowerCase().replace(/\s+/g, '_');
        const cType = r.querySelector('.col-type-select').value;
        if (!cName) continue;
        if (seenNames.has(cName)) {
          showError(`Колонка "${cName}" указана дважды!`);
          return;
        }
        seenNames.add(cName);
        columnDefs.push({ name: cName, type: cType });
      }

      try {
        DB.createTable(tableName, columnDefs);
        closeWin();
        if (window.App) window.App.showToast(`Таблица "${tableName}" успешно создана! 🎉`);
      } catch (err) {
        showError(err.message);
      }
    });

    win.querySelector('#cw-table-name').focus();
  }

  // ==========================================
  // 2. Add Column Floating Window
  // ==========================================
  function openAddColumnWindow(targetTableName = null) {
    const container = getContainer();

    if (addColWinEl) {
      addColWinEl.classList.remove('hidden');
      bringToFront(addColWinEl);
      updateAddColumnTablesDropdown(targetTableName);
      const colInput = addColWinEl.querySelector('#ac-col-name');
      if (colInput) colInput.focus();
      return;
    }

    const win = document.createElement('div');
    win.id = 'floating-add-column-win';
    win.className = 'floating-window pointer-events-auto absolute w-[420px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-indigo-200/90 dark:border-indigo-900/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 transition-all';

    const initialLeft = Math.max(20, Math.round((window.innerWidth - 420) / 2) + 60);
    const initialTop = Math.max(70, Math.round((window.innerHeight - 480) / 2));
    win.style.left = `${initialLeft}px`;
    win.style.top = `${initialTop}px`;
    bringToFront(win);

    win.innerHTML = `
      <!-- Draggable Header -->
      <div class="floating-window-handle flex items-center justify-between px-4 py-3 bg-indigo-50/90 dark:bg-indigo-950/70 border-b border-indigo-100 dark:border-indigo-900/60 cursor-move select-none">
        <div class="flex items-center gap-2 font-bold text-xs text-indigo-700 dark:text-indigo-300">
          <div class="p-1 rounded-lg bg-indigo-600 text-white shadow-xs">
            <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
          </div>
          <span>Добавление колонки</span>
        </div>
        <button class="btn-win-close p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition" title="Закрыть">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Window Content -->
      <div class="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
        <!-- Error Banner -->
        <div id="ac-error-banner" class="hidden text-xs py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2">
          <i data-lucide="alert-circle" class="w-4 h-4 shrink-0"></i>
          <span class="error-text"></span>
        </div>

        <!-- Target Table Selector -->
        <div>
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Таблица</label>
          <select id="ac-target-table" class="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
            <!-- options populated dynamically -->
          </select>
        </div>

        <!-- Column Name -->
        <div>
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Имя новой колонки</label>
          <input type="text" id="ac-col-name" placeholder="например: phone, birth_date, is_active" class="w-full px-3 py-2 text-xs font-mono font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400" />
        </div>

        <!-- Column Data Type -->
        <div>
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Тип данных</label>
          <select id="ac-col-type" class="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500">
            <option value="STRING" selected>STRING (Текст / VARCHAR)</option>
            <option value="INT">INT (Целое число)</option>
            <option value="FLOAT">FLOAT (Дробное число)</option>
            <option value="BOOLEAN">BOOLEAN (Логическое Да/Нет)</option>
          </select>
        </div>

        <!-- Default Value -->
        <div>
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Значение по умолчанию (опционально)</label>
          <input type="text" id="ac-col-default" placeholder="Оставьте пустым или укажите значение" class="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400" />
        </div>

        <!-- Constraint Checkboxes (NOT NULL, UNIQUE) -->
        <div class="flex items-center gap-4 py-1">
          <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
            <input type="checkbox" id="ac-is-notnull-toggle" class="rounded text-sky-600 focus:ring-sky-500" />
            <span class="flex items-center gap-1"><span>NOT NULL</span> <span class="text-[10px] text-slate-400">(обязательное)</span></span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
            <input type="checkbox" id="ac-is-unique-toggle" class="rounded text-purple-600 focus:ring-purple-500" />
            <span class="flex items-center gap-1"><span>UNIQUE</span> <span class="text-[10px] text-slate-400">(уникальное)</span></span>
          </label>
        </div>

        <!-- Foreign Key Relation Helper -->
        <div class="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-2">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" id="ac-is-fk-toggle" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
            <span class="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <i data-lucide="link-2" class="w-3.5 h-3.5 text-indigo-600"></i>
              Сделать внешним ключом (FK) к другой таблице
            </span>
          </label>
          
          <div id="ac-fk-target-container" class="hidden pt-1.5 space-y-1.5">
            <label class="block text-[11px] font-semibold text-slate-500">Связать с таблицей:</label>
            <select id="ac-fk-target-table" class="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500">
              <!-- populated dynamically -->
            </select>
            <p class="text-[10px] text-indigo-600 dark:text-indigo-400 italic">
              ✨ Имя колонки автоматически примет вид &lt;таблица&gt;_id, и на схеме БД сразу появится соединительная стрелка связи!
            </p>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
        <button type="button" class="btn-win-cancel px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl transition">
          Отмена
        </button>
        <button type="button" id="ac-btn-submit" class="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm transition shadow-indigo-500/20 flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Добавить колонку</span>
        </button>
      </div>
    `;

    container.appendChild(win);
    addColWinEl = win;
    lucide.createIcons();

    const handle = win.querySelector('.floating-window-handle');
    attachWindowDraggable(win, handle);

    const closeWin = (e) => {
      if (e) e.stopPropagation();
      win.classList.add('hidden');
    };
    const btnClose = win.querySelector('.btn-win-close');
    btnClose.addEventListener('pointerdown', e => e.stopPropagation());
    btnClose.addEventListener('click', closeWin);

    const btnCancel = win.querySelector('.btn-win-cancel');
    btnCancel.addEventListener('pointerdown', e => e.stopPropagation());
    btnCancel.addEventListener('click', closeWin);

    const showError = (msg) => {
      const banner = win.querySelector('#ac-error-banner');
      banner.querySelector('.error-text').textContent = msg;
      banner.classList.remove('hidden');
    };
    const hideError = () => {
      win.querySelector('#ac-error-banner').classList.add('hidden');
    };

    updateAddColumnTablesDropdown(targetTableName);

    // Foreign Key checkbox toggle handler
    const fkToggle = win.querySelector('#ac-is-fk-toggle');
    const fkContainer = win.querySelector('#ac-fk-target-container');
    const fkSelect = win.querySelector('#ac-fk-target-table');
    const colNameInput = win.querySelector('#ac-col-name');
    const colTypeSelect = win.querySelector('#ac-col-type');

    fkToggle.addEventListener('change', () => {
      fkContainer.classList.toggle('hidden', !fkToggle.checked);
      if (fkToggle.checked) {
        colTypeSelect.value = 'INT';
        updateFkTargetName();
      }
    });

    fkSelect.addEventListener('change', () => {
      if (fkToggle.checked) updateFkTargetName();
    });

    function updateFkTargetName() {
      const target = fkSelect.value;
      if (!target) return;
      // Singularize: students -> student, courses -> course
      let singular = target;
      if (target.endsWith('ies')) singular = target.replace(/ies$/, 'y');
      else if (target.endsWith('es')) singular = target.replace(/es$/, '');
      else if (target.endsWith('s')) singular = target.replace(/s$/, '');
      colNameInput.value = `${singular}_id`;
    }

    // Submit handler
    win.querySelector('#ac-btn-submit').addEventListener('click', () => {
      hideError();
      const targetTable = win.querySelector('#ac-target-table').value;
      const rawColName = colNameInput.value.trim();
      const colName = rawColName.toLowerCase().replace(/\s+/g, '_');
      const colType = colTypeSelect.value;
      const defVal = win.querySelector('#ac-col-default').value;

      if (!targetTable) {
        showError('Выберите таблицу для добавления колонки!');
        return;
      }
      if (!colName) {
        showError('Введите имя новой колонки!');
        return;
      }

      const isNotNull = !!win.querySelector('#ac-is-notnull-toggle')?.checked;
      const isUnique = !!win.querySelector('#ac-is-unique-toggle')?.checked;
      const isFK = !!fkToggle.checked;
      const fkTarget = isFK ? `${fkSelect.value}.id` : null;

      try {
        DB.addColumn(targetTable, colName, colType, defVal, { notNull: isNotNull, unique: isUnique, isFK, fkTarget });
        closeWin();
        if (window.App) window.App.showToast(`Колонка "${colName}" добавлена в таблицу "${targetTable}"! 🎉`);
      } catch (err) {
        showError(err.message);
      }
    });

    colNameInput.focus();
  }

  // ==========================================
  // Interactive ERD Graph Component & Floating Window
  // ==========================================
  let floatingErdWinEl = null;

  function renderErdGraphView(containerEl, isDrawer = false) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    let scale = isDrawer ? 0.8 : 0.95;
    let panX = isDrawer ? 20 : 40;
    let panY = isDrawer ? 20 : 35;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    const nodePositions = {
      students: { x: 30, y: 50 },
      courses: { x: 390, y: 50 },
      enrollments: { x: 210, y: 350 }
    };

    // Wrapper layout
    const wrapper = document.createElement('div');
    wrapper.className = 'relative w-full h-full overflow-hidden select-none bg-slate-50 dark:bg-slate-950';

    // Toolbar Controls HUD
    const toolbar = document.createElement('div');
    toolbar.className = 'absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 text-xs';
    toolbar.innerHTML = `
      <button class="btn-erd-zoom-out p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded" title="Отдалить (-)">
        <i data-lucide="minus" class="w-3.5 h-3.5"></i>
      </button>
      <button class="btn-erd-zoom-reset font-mono font-semibold px-1.5 py-0.5 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px]">
        ${Math.round(scale * 100)}%
      </button>
      <button class="btn-erd-zoom-in p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded" title="Приблизить (+)">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
      </button>
      <button class="btn-erd-fit p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded" title="По размеру">
        <i data-lucide="maximize" class="w-3.5 h-3.5"></i>
      </button>
      ${isDrawer ? `
        <div class="w-[1px] h-3.5 bg-slate-200 dark:border-slate-800 mx-0.5"></div>
        <button class="btn-erd-popout px-2 py-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 font-semibold rounded flex items-center gap-1" title="Открыть в отдельном окне">
          <i data-lucide="external-link" class="w-3 h-3"></i>
          <span>В окне</span>
        </button>
      ` : ''}
    `;
    wrapper.appendChild(toolbar);

    // World Layer containing cards & SVG
    const worldLayer = document.createElement('div');
    worldLayer.className = 'absolute inset-0 origin-top-left pointer-events-auto';
    wrapper.appendChild(worldLayer);

    // SVG connectors layer
    const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgLayer.setAttribute('class', 'absolute inset-0 w-full h-full pointer-events-none');
    svgLayer.style.overflow = 'visible';
    svgLayer.innerHTML = `
      <defs>
        <marker id="erd-sub-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#6366f1"></path>
        </marker>
      </defs>
      <g class="erd-sub-connectors"></g>
    `;
    worldLayer.appendChild(svgLayer);

    const connectorsGroup = svgLayer.querySelector('.erd-sub-connectors');
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'absolute inset-0 pointer-events-none';
    worldLayer.appendChild(cardsContainer);

    containerEl.appendChild(wrapper);
    lucide.createIcons();

    function updateWorldTransform() {
      worldLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      const zoomBtn = toolbar.querySelector('.btn-erd-zoom-reset');
      if (zoomBtn) zoomBtn.textContent = `${Math.round(scale * 100)}%`;
      drawConnectors();
    }

    // Panning & zooming events on wrapper
    wrapper.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.erd-node-card') || e.target.closest('button') || e.target.closest('input')) return;
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      wrapper.style.cursor = 'grabbing';
    });

    window.addEventListener('pointermove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      updateWorldTransform();
    });

    window.addEventListener('pointerup', () => {
      if (isPanning) {
        isPanning = false;
        wrapper.style.cursor = 'default';
      }
    });

    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      let newScale = scale * factor;
      newScale = Math.max(0.3, Math.min(newScale, 2.5));

      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;
      updateWorldTransform();
    }, { passive: false });

    // Toolbar actions
    toolbar.querySelector('.btn-erd-zoom-in')?.addEventListener('click', () => {
      scale = Math.min(2.5, scale * 1.15);
      updateWorldTransform();
    });
    toolbar.querySelector('.btn-erd-zoom-out')?.addEventListener('click', () => {
      scale = Math.max(0.3, scale / 1.15);
      updateWorldTransform();
    });
    toolbar.querySelector('.btn-erd-zoom-reset')?.addEventListener('click', () => {
      scale = 1;
      panX = 40;
      panY = 40;
      updateWorldTransform();
    });
    toolbar.querySelector('.btn-erd-fit')?.addEventListener('click', () => {
      scale = isDrawer ? 0.75 : 0.85;
      panX = 30;
      panY = 30;
      updateWorldTransform();
    });
    toolbar.querySelector('.btn-erd-popout')?.addEventListener('click', () => {
      openErdWindow();
    });

    // Render Cards for tables
    function renderCards() {
      cardsContainer.innerHTML = '';
      const schema = DB.getSchemaMetadata();
      const tableNames = Object.keys(schema);

      let customCol = 0;
      let customRow = 0;

      tableNames.forEach((tName) => {
        const info = schema[tName];
        if (!nodePositions[tName]) {
          nodePositions[tName] = {
            x: 40 + (customCol % 2) * 360,
            y: 40 + Math.floor(customRow) * 320
          };
          customCol++;
          if (customCol % 2 === 0) customRow++;
        }

        const pos = nodePositions[tName];
        const card = document.createElement('div');
        card.id = `erd-node-${tName}`;
        card.className = 'erd-node-card absolute pointer-events-auto w-[300px] rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900 shadow-md flex flex-col overflow-hidden';
        card.style.left = `${pos.x}px`;
        card.style.top = `${pos.y}px`;

        card.innerHTML = `
          <div class="erd-node-header flex items-center justify-between px-3 py-2 bg-indigo-50/90 dark:bg-indigo-950/70 border-b border-indigo-100 dark:border-indigo-900 cursor-grab select-none">
            <div class="flex items-center gap-1.5 font-bold text-xs text-indigo-700 dark:text-indigo-300">
              <i data-lucide="table" class="w-3.5 h-3.5"></i>
              <span>${info.name}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-200/50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">${info.rowCount} строк</span>
              <button type="button" class="btn-node-add-col p-1 hover:bg-indigo-200/60 dark:hover:bg-indigo-800 text-indigo-600 dark:text-indigo-300 rounded" title="Добавить колонку">
                <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
          <div class="p-2 space-y-1 font-mono text-[11px] max-h-60 overflow-y-auto">
            ${info.columns.map(c => `
              <div class="erd-node-col-row flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition select-none cursor-pointer"
                   data-col="${c.name}" data-table="${info.name}" data-is-pk="${c.isPK ? '1' : '0'}" data-is-fk="${c.isFK ? '1' : '0'}" data-fk-target="${c.fkTarget || ''}">
                <div class="flex items-center gap-1.5 truncate flex-1 min-w-0 mr-1">
                  ${c.isPK ? '<span class="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-1 py-0.5 rounded shadow-2xs shrink-0">PK 🔑</span>' : ''}
                  ${c.isFK ? `<span class="text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-1 py-0.5 rounded shadow-2xs shrink-0" title="${c.fkTarget || ''}">FK 🔗</span>` : ''}
                  ${c.notNull && !c.isPK ? '<span class="text-[9px] font-mono font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 px-1 py-0.5 rounded shrink-0">NN</span>' : ''}
                  ${c.unique && !c.isPK ? '<span class="text-[9px] font-mono font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 px-1 py-0.5 rounded shrink-0">UQ</span>' : ''}
                  <span class="text-slate-800 dark:text-slate-200 font-medium truncate">${c.name}</span>
                </div>
                <span class="text-[10px] text-slate-400 uppercase font-mono shrink-0">${c.type}</span>
              </div>
            `).join('')}
          </div>
        `;

        cardsContainer.appendChild(card);

        // Header dragging to reposition card
        const cardHeader = card.querySelector('.erd-node-header');
        let isCardDragging = false;
        let cStartX = 0;
        let cStartY = 0;
        let initialX = pos.x;
        let initialY = pos.y;

        cardHeader.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button')) return;
          e.stopPropagation();
          isCardDragging = true;
          cStartX = e.clientX;
          cStartY = e.clientY;
          initialX = pos.x;
          initialY = pos.y;
          cardHeader.setPointerCapture(e.pointerId);
          card.style.zIndex = '40';
        });

        cardHeader.addEventListener('pointermove', (e) => {
          if (!isCardDragging) return;
          const dx = (e.clientX - cStartX) / scale;
          const dy = (e.clientY - cStartY) / scale;
          pos.x = Math.round(initialX + dx);
          pos.y = Math.round(initialY + dy);
          card.style.left = `${pos.x}px`;
          card.style.top = `${pos.y}px`;
          drawConnectors();
        });

        cardHeader.addEventListener('pointerup', () => {
          if (isCardDragging) {
            isCardDragging = false;
            card.style.zIndex = '10';
          }
        });

        // Add Column button
        card.querySelector('.btn-node-add-col')?.addEventListener('click', (e) => {
          e.stopPropagation();
          openAddColumnWindow(info.name);
        });

        // Column row hover highlights
        card.querySelectorAll('.erd-node-col-row').forEach(row => {
          const colName = row.dataset.col;
          const isFK = row.dataset.isFk === '1';
          const isPK = row.dataset.isPk === '1';

          row.addEventListener('pointerenter', () => {
            if (!isFK && !isPK) return;
            wrapper.querySelectorAll('.erd-sub-rel-group').forEach(relG => {
              const matches = (isFK && relG.dataset.fromTable === info.name && relG.dataset.fromCol === colName) ||
                              (isPK && relG.dataset.toTable === info.name && relG.dataset.toCol === colName);
              if (matches) {
                relG.querySelector('.erd-sub-path')?.classList.add('highlighted');
                document.getElementById(`erd-node-${relG.dataset.fromTable}`)?.classList.add('erd-table-highlight');
                document.getElementById(`erd-node-${relG.dataset.toTable}`)?.classList.add('erd-table-highlight');
                document.getElementById(`erd-node-${relG.dataset.fromTable}`)?.querySelector(`[data-col="${relG.dataset.fromCol}"]`)?.classList.add('erd-col-highlight');
                document.getElementById(`erd-node-${relG.dataset.toTable}`)?.querySelector(`[data-col="${relG.dataset.toCol}"]`)?.classList.add('erd-col-highlight');
              }
            });
          });

          row.addEventListener('pointerleave', () => {
            if (!isFK && !isPK) return;
            wrapper.querySelectorAll('.erd-sub-rel-group').forEach(relG => {
              relG.querySelector('.erd-sub-path')?.classList.remove('highlighted');
              document.getElementById(`erd-node-${relG.dataset.fromTable}`)?.classList.remove('erd-table-highlight');
              document.getElementById(`erd-node-${relG.dataset.toTable}`)?.classList.remove('erd-table-highlight');
              document.getElementById(`erd-node-${relG.dataset.fromTable}`)?.querySelector(`[data-col="${relG.dataset.fromCol}"]`)?.classList.remove('erd-col-highlight');
              document.getElementById(`erd-node-${relG.dataset.toTable}`)?.querySelector(`[data-col="${relG.dataset.toCol}"]`)?.classList.remove('erd-col-highlight');
            });
          });
        });
      });

      lucide.createIcons();
      drawConnectors();
    }

    // Draw field-to-field SVG curves
    function drawConnectors() {
      if (!connectorsGroup) return;
      const rels = DB.getRelationships();
      let svg = '';

      rels.forEach(rel => {
        const fromPos = nodePositions[rel.fromTable];
        const toPos = nodePositions[rel.toTable];
        if (!fromPos || !toPos) return;

        const fromCard = wrapper.querySelector(`#erd-node-${rel.fromTable}`);
        const toCard = wrapper.querySelector(`#erd-node-${rel.toTable}`);
        if (!fromCard || !toCard) return;

        const fromColEl = fromCard.querySelector(`[data-col="${rel.fromCol}"]`);
        const toColEl = toCard.querySelector(`[data-col="${rel.toCol}"]`);

        const fromCardRect = fromCard.getBoundingClientRect();
        const fromColRect = fromColEl ? fromColEl.getBoundingClientRect() : null;
        let fromY = fromPos.y + (fromColRect ? Math.round((fromColRect.top - fromCardRect.top + fromColRect.height / 2) / scale) : 60);

        const toCardRect = toCard.getBoundingClientRect();
        const toColRect = toColEl ? toColEl.getBoundingClientRect() : null;
        let toY = toPos.y + (toColRect ? Math.round((toColRect.top - toCardRect.top + toColRect.height / 2) / scale) : 60);

        fromY = Math.max(fromPos.y + 16, Math.min(fromPos.y + fromCard.offsetHeight - 16, fromY));
        toY = Math.max(toPos.y + 16, Math.min(toPos.y + toCard.offsetHeight - 16, toY));

        const fromCenter = fromPos.x + 150;
        const toCenter = toPos.x + 150;
        let startX, endX, cp1X, cp1Y, cp2X, cp2Y;

        if (fromCenter <= toCenter) {
          startX = fromPos.x + 300;
          endX = toPos.x;
          const dist = Math.max(40, Math.abs(endX - startX) * 0.45);
          cp1X = startX + dist; cp1Y = fromY;
          cp2X = endX - dist; cp2Y = toY;
        } else {
          startX = fromPos.x;
          endX = toPos.x + 300;
          const dist = Math.max(40, Math.abs(startX - endX) * 0.45);
          cp1X = startX - dist; cp1Y = fromY;
          cp2X = endX + dist; cp2Y = toY;
        }

        const pathData = `M ${startX} ${fromY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${toY}`;

        svg += `
          <g class="erd-sub-rel-group pointer-events-auto cursor-pointer" data-from-table="${rel.fromTable}" data-to-table="${rel.toTable}" data-from-col="${rel.fromCol}" data-to-col="${rel.toCol}">
            <path d="${pathData}" fill="none" stroke="transparent" stroke-width="20" class="erd-hit-path" />
            <path d="${pathData}" fill="none" stroke="#6366f1" stroke-width="2.5" marker-end="url(#erd-sub-arrow)" class="erd-sub-path erd-relation-path" />
            <circle cx="${startX}" cy="${fromY}" r="5" fill="#10b981" stroke="#ffffff" stroke-width="2" class="erd-origin-dot" title="${rel.fromTable}.${rel.fromCol} (FK)" />
            <circle cx="${endX}" cy="${toY}" r="5" fill="#6366f1" stroke="#ffffff" stroke-width="2" class="erd-target-dot" title="${rel.toTable}.${rel.toCol} (PK)" />
          </g>
        `;
      });

      connectorsGroup.innerHTML = svg;
    }

    renderCards();
    updateWorldTransform();

    // Auto-update on DB changes
    const onDbChange = () => {
      renderCards();
    };
    DB.on('change', onDbChange);
  }

  function openErdWindow() {
    const container = getContainer();

    if (floatingErdWinEl) {
      floatingErdWinEl.classList.remove('hidden');
      bringToFront(floatingErdWinEl);
      return;
    }

    const win = document.createElement('div');
    win.id = 'floating-erd-window';
    win.className = 'floating-window pointer-events-auto fixed rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden';
    win.style.width = '780px';
    win.style.height = '560px';
    win.style.left = `${Math.max(40, window.innerWidth / 2 - 390)}px`;
    win.style.top = `${Math.max(40, window.innerHeight / 2 - 280)}px`;
    win.style.zIndex = ++highestZIndex;

    win.innerHTML = `
      <div class="floating-window-handle flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 border-b border-indigo-100 dark:border-indigo-900/50 cursor-grab select-none">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <i data-lucide="network" class="w-3.5 h-3.5"></i>
          </div>
          <div>
            <h3 class="text-xs font-bold text-slate-800 dark:text-slate-100">Схема связей (ERD Canvas)</h3>
            <span class="text-[10px] text-slate-400">Интерактивные узлы таблиц и внешние ключи</span>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button type="button" class="btn-win-close p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-lg transition" title="Закрыть">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <div class="erd-window-body flex-1 min-h-0 relative overflow-hidden bg-slate-50 dark:bg-slate-950"></div>
    `;

    container.appendChild(win);
    floatingErdWinEl = win;
    lucide.createIcons();

    const handle = win.querySelector('.floating-window-handle');
    attachWindowDraggable(win, handle);

    const closeBtn = win.querySelector('.btn-win-close');
    closeBtn.addEventListener('pointerdown', e => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      win.classList.add('hidden');
    });

    const body = win.querySelector('.erd-window-body');
    renderErdGraphView(body, false);
  }

  function updateAddColumnTablesDropdown(selectedTable = null) {
    if (!addColWinEl) return;
    const tableSelect = addColWinEl.querySelector('#ac-target-table');
    const fkSelect = addColWinEl.querySelector('#ac-fk-target-table');
    if (!tableSelect) return;

    const tables = Object.keys(DB.getTables());
    tableSelect.innerHTML = tables.map(t => `
      <option value="${t}" ${t === selectedTable ? 'selected' : ''}>${t}</option>
    `).join('');

    if (fkSelect) {
      fkSelect.innerHTML = tables.map(t => `
        <option value="${t}">${t}</option>
      `).join('');
    }
  }

  return {
    openCreateTableWindow,
    openAddColumnWindow,
    openErdWindow,
    renderErdGraphView,
    updateTablesList: updateAddColumnTablesDropdown
  };
})();

window.FloatingWindows = FloatingWindows;
