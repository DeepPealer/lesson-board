/**
 * =========================================================
 * MiroSQL Studio - Main Application Controller
 * =========================================================
 */

const App = (() => {
  const STORAGE_KEY = 'mirosql_board_state_v3';
  let activeTableTab = 'students';

  function init() {
    try { DB.init(); } catch (e) { console.error('DB.init error:', e); }
    try { Canvas.init('canvas-container', 'world-layer', 'drawing-svg-layer', 'drawing-transform-group'); } catch (e) { console.error('Canvas.init error:', e); }
    try { Tools.init(); } catch (e) { console.error('Tools.init error:', e); }
    try { History.init(); } catch (e) { console.error('History.init error:', e); }
    try { Collab.init(); } catch (e) { console.error('Collab.init error:', e); }
    try { Widgets.init(); } catch (e) { console.error('Widgets.init error:', e); }
    
    // Setup UI listeners early
    try { setupUI(); } catch (e) { console.error('setupUI error:', e); }
    try { setupShortcuts(); } catch (e) { console.error('setupShortcuts error:', e); }

    // Initialize Pages and load active page
    try { Pages.init(); } catch (e) { console.error('Pages.init error:', e); }
    try { BoardXML.init(); } catch (e) { console.error('BoardXML.init error:', e); }

    // Database Manager Drawer
    try {
      renderDatabaseManager();
      DB.on('change', () => { renderDatabaseManager(); });
    } catch (e) { console.error('Database Manager error:', e); }

    try { lucide.createIcons(); } catch (e) { console.error('lucide error:', e); }
  }

  function setupUI() {
    // Zoom & HUD controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', Canvas.zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', Canvas.zoomOut);
    document.getElementById('btn-zoom-reset')?.addEventListener('click', Canvas.resetZoom);
    document.getElementById('btn-fit-view')?.addEventListener('click', Canvas.centerView);

    // Role toggle
    document.getElementById('role-badge')?.addEventListener('click', Collab.toggleRole);

    // Follow mode toggle
    document.getElementById('btn-follow-mode')?.addEventListener('click', Collab.toggleFollowMode);

    // Spotlight toggle
    document.getElementById('btn-spotlight-toggle')?.addEventListener('click', Collab.toggleSpotlight);

    // Database Manager Drawer toggle
    const dbDrawer = document.getElementById('database-drawer');
    const btnDbToggle = document.getElementById('btn-db-toggle');
    const btnDbClose = document.getElementById('btn-db-close');

    btnDbToggle?.addEventListener('click', () => {
      dbDrawer.classList.toggle('translate-x-full');
      renderDatabaseManager();
    });

    btnDbClose?.addEventListener('click', () => {
      dbDrawer.classList.add('translate-x-full');
    });

    // Quick Non-Modal Window Openers
    document.getElementById('btn-quick-new-table')?.addEventListener('click', () => {
      FloatingWindows.openCreateTableWindow();
    });
    document.getElementById('btn-quick-new-column')?.addEventListener('click', () => {
      FloatingWindows.openAddColumnWindow(activeTableTab === '__erd__' ? 'students' : activeTableTab);
    });
    document.getElementById('btn-quick-erd-window')?.addEventListener('click', () => {
      FloatingWindows.openErdWindow();
    });

    // Reset Board
    document.getElementById('btn-reset-board')?.addEventListener('click', () => {
      if (confirm('Сбросить текущую страницу к исходному виду?')) {
        Pages.resetCurrentPage();
      }
    });

    // Export JSON
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const data = {
        title: document.getElementById('board-title')?.value || 'MiroSQL Board',
        pages: Pages.getPages(),
        database: DB.getTables(),
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mirosql_full_project_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Проект экспортирован в JSON');
    });

    document.getElementById('btn-export-xml')?.addEventListener('click', () => {
      try { BoardXML.exportFile(); showToast('XML-файл доски сохранён'); }
      catch (error) { showToast('Ошибка экспорта: ' + error.message); }
    });
    const xmlInput = document.getElementById('input-import-xml');
    document.getElementById('btn-import-xml')?.addEventListener('click', () => xmlInput?.click());
    xmlInput?.addEventListener('change', async () => {
      const file = xmlInput.files?.[0];
      xmlInput.value = '';
      if (!file) return;
      try {
        if (file.size > 6 * 1024 * 1024) throw Error('Файл превышает 6 МБ');
        const content = await file.text();
        const parsed = BoardXML.parse(content);
        if (!confirm('Заменить текущую доску и базу данных содержимым XML? Это изменит общий урок для всех подключённых участников.')) return;
        BoardXML.importXml(content);
        showToast('Импортировано страниц: ' + parsed.pages.length);
      } catch (error) {
        console.error('XML import:', error);
        showToast('XML: ' + error.message);
      }
    });
    // Drag and drop images directly onto canvas
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          const worldPos = Canvas.screenToWorld(e.clientX, e.clientY);
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (window.History) History.capture();
            Widgets.createImage(worldPos.x, worldPos.y, evt.target.result);
            showToast('Изображение добавлено на доску');
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // Title editing auto-save
    document.getElementById('board-title')?.addEventListener('input', e => {
      BoardXML.setTitle(e.target.value, true);
      saveState();
    });
  }

  function setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'v' || e.key === 'V') Tools.setTool('select');
      if (e.key === 'h' || e.key === 'H') Tools.setTool('hand');
      if (e.key === 'p' || e.key === 'P' || e.key === 'b' || e.key === 'B') Tools.setTool('brush');
      if (e.key === 'e' || e.key === 'E') Tools.setTool('eraser');
      if (e.key === 's' || e.key === 'S') Tools.setTool('sticky');
      if (e.key === 'q' || e.key === 'Q') Tools.setTool('sql');
      if (e.key === 'i' || e.key === 'I') Tools.setTool('image');
      if (e.key === 't' || e.key === 'T') Tools.setTool('assignment');
      if (e.key === 'k' || e.key === 'K') Tools.setTool('checklist');
      if (e.key === 'm' || e.key === 'M') Tools.setTool('quiz');
    });
  }

  // ==========================================
  // Database Manager with Inline Cell & Column Editing
  // ==========================================
  function renderDatabaseManager() {
    const tables = DB.getTables();
    const tableNames = Object.keys(tables);
    if (activeTableTab !== '__erd__' && !tableNames.includes(activeTableTab) && tableNames.length > 0) {
      activeTableTab = tableNames[0];
    }

    // Render Table Tabs
    const tabsContainer = document.getElementById('db-table-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    // ERD Tab Button
    const erdTabBtn = document.createElement('button');
    erdTabBtn.className = `px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition whitespace-nowrap shadow-sm ${
      activeTableTab === '__erd__'
        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md ring-2 ring-indigo-400/30'
        : 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800/60'
    }`;
    erdTabBtn.innerHTML = `
      <i data-lucide="network" class="w-3.5 h-3.5"></i>
      <span>🗺️ ERD-схема</span>
    `;
    erdTabBtn.addEventListener('click', () => {
      activeTableTab = '__erd__';
      renderDatabaseManager();
    });
    tabsContainer.appendChild(erdTabBtn);

    tableNames.forEach(tName => {
      const rowCount = (tables[tName] || []).length;
      const btn = document.createElement('button');
      btn.className = `px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition whitespace-nowrap ${
        activeTableTab === tName
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`;
      btn.innerHTML = `
        <i data-lucide="table" class="w-3.5 h-3.5"></i>
        <span>${tName}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded-full ${activeTableTab === tName ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}">${rowCount}</span>
      `;
      btn.addEventListener('click', () => {
        activeTableTab = tName;
        renderDatabaseManager();
      });
      tabsContainer.appendChild(btn);
    });

    const tableView = document.getElementById('db-drawer-table-view');
    const erdView = document.getElementById('db-drawer-erd-view');

    if (activeTableTab === '__erd__') {
      if (tableView) tableView.classList.add('hidden');
      if (erdView) {
        erdView.classList.remove('hidden');
        erdView.innerHTML = '';
        FloatingWindows.renderErdGraphView(erdView, true);
      }
      lucide.createIcons();
      return;
    }

    if (tableView) tableView.classList.remove('hidden');
    if (erdView) erdView.classList.add('hidden');

    // Render Active Table Content
    const rows = tables[activeTableTab] || [];
    const tableHeader = document.getElementById('db-preview-thead');
    const tableBody = document.getElementById('db-preview-tbody');
    const rowCountBadge = document.getElementById('db-current-row-count');

    if (rowCountBadge) rowCountBadge.textContent = `${rows.length} записей`;

    if (tableHeader && tableBody) {
      tableHeader.innerHTML = '';
      tableBody.innerHTML = '';

      if (rows.length === 0) {
        tableHeader.innerHTML = '<th class="p-2 text-slate-400">Таблица пуста</th>';
        tableBody.innerHTML = '<tr><td class="p-4 text-center text-slate-400">Нет записей. Нажмите «Сгенерировать данные» или добавьте строку.</td></tr>';
      } else {
        const cols = Object.keys(rows[0]);
        const schemaMeta = DB.getSchemaMetadata();
        const tableMeta = schemaMeta[activeTableTab];
        const colDefinitions = (tableMeta && tableMeta.columns) ? tableMeta.columns : [];

        // Headers with drop column buttons and constraints badges
        cols.forEach(c => {
          const colDef = colDefinitions.find(col => col.name === c) || {};
          let badgesHtml = '';
          if (colDef.isPK) {
            badgesHtml += '<span class="px-1 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" title="Primary Key">PK 🔑</span>';
          }
          if (colDef.isFK) {
            badgesHtml += `<span class="px-1 py-0.5 text-[9px] font-bold rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" title="Foreign Key -> ${colDef.fkTarget || ''}">FK 🔗</span>`;
          }
          if (colDef.notNull) {
            badgesHtml += '<span class="px-1 py-0.5 text-[8px] font-bold rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300" title="NOT NULL">NN</span>';
          }
          if (colDef.unique) {
            badgesHtml += '<span class="px-1 py-0.5 text-[8px] font-bold rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" title="UNIQUE">UQ</span>';
          }

          const th = document.createElement('th');
          th.className = 'py-2 px-3 font-semibold text-[11px] whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200';
          th.innerHTML = `
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-slate-800 dark:text-slate-100">${c}</span>
                ${badgesHtml}
              </div>
              ${cols.length > 1 ? `<button data-col="${c}" class="btn-drop-col text-slate-400 hover:text-rose-500 p-0.5 rounded" title="Удалить колонку">×</button>` : ''}
            </div>
          `;
          const dropBtn = th.querySelector('.btn-drop-col');
          if (dropBtn) {
            dropBtn.addEventListener('click', () => {
              if (confirm(`Удалить колонку "${c}" из таблицы ${activeTableTab}?`)) {
                DB.dropColumn(activeTableTab, c);
                showToast(`Колонка ${c} удалена`);
              }
            });
          }
          tableHeader.appendChild(th);
        });

        const thAction = document.createElement('th');
        thAction.className = 'py-2 px-2 text-center text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400';
        thAction.textContent = 'Действие';
        tableHeader.appendChild(thAction);

        // Rows with Inline Cell Editing
        rows.slice(0, 60).forEach((row, rowIdx) => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800';

          cols.forEach(c => {
            const td = document.createElement('td');
            td.className = 'py-1 px-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-indigo-50/50';
            const cellVal = row[c] !== null && row[c] !== undefined ? row[c] : '';
            td.textContent = cellVal !== '' ? cellVal : 'NULL';

            // Inline Cell Editor on click
            td.addEventListener('click', () => {
              if (td.querySelector('input')) return;
              const input = document.createElement('input');
              input.type = 'text';
              input.className = 'w-full px-1 py-0.5 text-xs bg-white dark:bg-slate-900 border border-indigo-500 rounded outline-none font-mono';
              input.value = cellVal;

              const commit = () => {
                const newVal = input.value;
                DB.updateCell(activeTableTab, rowIdx, c, newVal);
                renderDatabaseManager();
              };

              input.addEventListener('blur', commit);
              input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                  input.blur();
                } else if (e.key === 'Escape') {
                  td.textContent = cellVal;
                }
              });

              td.innerHTML = '';
              td.appendChild(input);
              input.focus();
              input.select();
            });

            tr.appendChild(td);
          });

          // Delete row button
          const tdDel = document.createElement('td');
          tdDel.className = 'py-1 px-2 text-center';
          const btnDelRow = document.createElement('button');
          btnDelRow.className = 'p-1 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded';
          btnDelRow.innerHTML = '<i data-lucide="trash-2" class="w-3 h-3"></i>';
          btnDelRow.title = 'Удалить строку';
          btnDelRow.addEventListener('click', () => {
            DB.deleteRow(activeTableTab, rowIdx);
            showToast('Строка удалена');
          });
          tdDel.appendChild(btnDelRow);
          tr.appendChild(tdDel);

          tableBody.appendChild(tr);
        });
      }
    }

    // Add Column Button Handler (opens non-modal window)
    document.getElementById('btn-add-column')?.replaceWith(document.getElementById('btn-add-column').cloneNode(true));
    document.getElementById('btn-add-column')?.addEventListener('click', () => {
      FloatingWindows.openAddColumnWindow(activeTableTab);
    });

    // Add Row Button Handler
    document.getElementById('btn-add-row')?.replaceWith(document.getElementById('btn-add-row').cloneNode(true));
    document.getElementById('btn-add-row')?.addEventListener('click', () => {
      const currentRows = DB.getTable(activeTableTab);
      let cols = [];
      if (currentRows.length > 0) {
        cols = Object.keys(currentRows[0]);
      } else {
        const schema = DB.getSchemaMetadata();
        if (schema[activeTableTab] && schema[activeTableTab].columns.length > 0) {
          cols = schema[activeTableTab].columns.map(c => c.name);
        } else {
          cols = ['id', 'name'];
        }
      }

      if (!cols.map(c => c.toLowerCase()).includes('id')) {
        cols.unshift('id');
      }

      let maxId = 0;
      currentRows.forEach(r => {
        const val = Number(r.id);
        if (!isNaN(val) && val > maxId) maxId = val;
      });

      const newRow = {};
      cols.forEach(c => {
        if (c.toLowerCase() === 'id') {
          newRow[c] = maxId + 1;
        } else {
          newRow[c] = '';
        }
      });
      newRow.id = maxId + 1;

      const added = DB.addRow(activeTableTab, newRow);
      renderDatabaseManager();
      showToast(`Новая строка добавлена (id = ${added.id})`);
    });

    // Generator Buttons
    document.getElementById('btn-gen-students')?.replaceWith(document.getElementById('btn-gen-students').cloneNode(true));
    document.getElementById('btn-gen-students')?.addEventListener('click', () => {
      DB.generateStudents(10);
      showToast('Добавлено 10 случайных студентов');
    });

    document.getElementById('btn-gen-courses')?.replaceWith(document.getElementById('btn-gen-courses').cloneNode(true));
    document.getElementById('btn-gen-courses')?.addEventListener('click', () => {
      DB.generateCourses(3);
      showToast('Добавлено 3 новых курса');
    });

    document.getElementById('btn-gen-enrollments')?.replaceWith(document.getElementById('btn-gen-enrollments').cloneNode(true));
    document.getElementById('btn-gen-enrollments')?.addEventListener('click', () => {
      DB.generateEnrollments(15);
      showToast('Сгенерировано 15 оценок и успеваемости');
    });

    document.getElementById('btn-seed-all')?.replaceWith(document.getElementById('btn-seed-all').cloneNode(true));
    document.getElementById('btn-seed-all')?.addEventListener('click', () => {
      if (confirm('Сбросить базу данных и наполнить полными демо-данными?')) {
        DB.seedAllDefaultData();
        showToast('База данных переполнена демо-данными');
      }
    });

    document.getElementById('btn-clear-active-table')?.replaceWith(document.getElementById('btn-clear-active-table').cloneNode(true));
    document.getElementById('btn-clear-active-table')?.addEventListener('click', () => {
      if (confirm(`Очистить все записи в таблице "${activeTableTab}"?`)) {
        DB.clearTable(activeTableTab);
        showToast(`Таблица ${activeTableTab} очищена`);
      }
    });

    // Create Table Button Handler (opens non-modal window)
    document.getElementById('btn-create-table-prompt')?.replaceWith(document.getElementById('btn-create-table-prompt').cloneNode(true));
    document.getElementById('btn-create-table-prompt')?.addEventListener('click', () => {
      FloatingWindows.openCreateTableWindow();
    });

    lucide.createIcons();
  }

  function saveState() {
    if (window.Pages) Pages.saveCurrentPageState();
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;

    toastText.textContent = message;
    toast.classList.remove('translate-y-16', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
      toast.classList.add('translate-y-16', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2800);
  }

  return {
    init,
    saveState,
    showToast
  };
})();
window.App = App;

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
