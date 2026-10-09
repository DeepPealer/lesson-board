/**
 * =========================================================
 * MiroSQL Studio - Multi-Page Management & ERD Visual Schema
 * =========================================================
 */

const Pages = (() => {
  const STORAGE_KEY = 'mirosql_pages_v3';
  let activePageId = 'page_1';
  let pages = [];

  function init() {
    loadPagesFromStorage();
    renderPageTabs();
    switchToPage(activePageId, false);

    window.addEventListener('beforeunload', () => {
      saveCurrentPageState();
    });

    if (window.DB) {
      DB.on('change', () => {
        syncErdPageWithDatabase();
      });
    }
  }

  function syncErdPageWithDatabase() {
    const erdPage = pages.find(p => p.type === 'erd' || p.id === 'page_erd');
    if (!erdPage) return;

    const schema = DB.getSchemaMetadata();
    const tableNames = Object.keys(schema);

    const isCurrentErd = getActivePage()?.id === erdPage.id;
    if (isCurrentErd) {
      if (window.Widgets) Widgets.refreshErdWidgets();
      return;
    }

    if (!Array.isArray(erdPage.items)) erdPage.items = [];

    // Filter out dropped tables
    erdPage.items = erdPage.items.filter(item => {
      if (item.type !== 'erd_table') return true;
      return !!schema[item.tableName];
    });

    // Add newly created tables
    let rightMostX = erdPage.items
      .filter(i => i.type === 'erd_table')
      .reduce((max, it) => Math.max(max, (it.x || 0) + (it.width || 300)), 60);

    tableNames.forEach(tName => {
      const exists = erdPage.items.some(i => i.type === 'erd_table' && i.tableName === tName);
      if (!exists) {
        erdPage.items.push({
          id: 'erd_' + tName,
          type: 'erd_table',
          x: rightMostX + 40,
          y: 80,
          width: 300,
          height: 260,
          tableName: tName,
          isLocked: false
        });
        rightMostX += 340;
      }
    });

    savePagesToStorage(true);
  }

  function getActivePage() {
    return pages.find(p => p.id === activePageId) || pages[0];
  }

  function loadPagesFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pages = parsed;
          const savedActive = localStorage.getItem('mirosql_active_page_id');
          if (savedActive && pages.some(p => p.id === savedActive)) {
            activePageId = savedActive;
          } else {
            activePageId = pages[0].id;
          }
          return;
        }
      } catch (e) {
        console.error('Failed to parse saved pages:', e);
      }
    }

    // Default template pages if not found
    pages = [
      {
        id: 'page_1',
        title: 'Урок 1: Основы SELECT',
        type: 'canvas',
        scale: 1,
        pan: { x: 70, y: 80 },
        strokes: [],
        items: [] // will be filled by default seed if empty
      },
      {
        id: 'page_2',
        title: 'Урок 2: Фильтры & JOIN',
        type: 'canvas',
        scale: 1,
        pan: { x: 70, y: 80 },
        strokes: [],
        items: []
      },
      {
        id: 'page_erd',
        title: 'Схема БД (ERD)',
        type: 'erd',
        scale: 1,
        pan: { x: 70, y: 80 },
        strokes: [],
        items: []
      }
    ];
    activePageId = 'page_1';
    savePagesToStorage(false);
  }

  function saveCurrentPageState(broadcast = false) {
    const current = getActivePage();
    if (!current) return;

    current.scale = Canvas.getScale();
    current.pan = Canvas.getPan();
    current.strokes = Canvas.getStrokes();
    current.items = Widgets.getItems();
    savePagesToStorage(broadcast);
  }

  function savePagesToStorage(broadcast = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    localStorage.setItem('mirosql_active_page_id', activePageId);
    if (broadcast && window.Collab) {
      Collab.broadcastPagesUpdate(pages, activePageId);
    }
  }

  function replaceAllPages(newPages, nextActiveId, broadcast = true) {
    if (!Array.isArray(newPages) || newPages.length === 0) throw Error('Empty board');
    pages = newPages;
    activePageId = pages.some(p => p.id === nextActiveId) ? nextActiveId : pages[0].id;
    const page = getActivePage();
    Canvas.setScale(page.scale ?? 1);
    Canvas.setPan(page.pan?.x ?? 70, page.pan?.y ?? 80);
    Canvas.setStrokes(page.strokes || []);
    Widgets.loadItems(page.items || []);
    renderPageTabs();
    savePagesToStorage(broadcast);
  }

  function onRemotePagesUpdate(remotePages, remoteActivePageId) {
    if (!Array.isArray(remotePages) || remotePages.length === 0) return;
    if (!remotePages.some(p => p.id === activePageId)) {
      replaceAllPages(remotePages, remoteActivePageId, false);
      return;
    }
    pages = remotePages;
    savePagesToStorage(false);
    renderPageTabs();
    if (window.Collab && Collab.isFollowing() && remoteActivePageId && remoteActivePageId !== activePageId) {
      switchToPage(remoteActivePageId, false);
      return;
    }
    const current = pages.find(p => p.id === activePageId);
    if (current && Array.isArray(current.items) && window.Widgets && Widgets.syncItemsFromState) {
      Widgets.syncItemsFromState(current.items);
    }
  }

  function switchToPage(pageId, shouldSaveCurrent = true) {
    if (shouldSaveCurrent) {
      saveCurrentPageState();
    }

    const targetPage = pages.find(p => p.id === pageId);
    if (!targetPage) return;

    activePageId = pageId;
    localStorage.setItem('mirosql_active_page_id', activePageId);

    // Apply viewport & items
    Canvas.setScale(targetPage.scale || 1);
    Canvas.setPan(targetPage.pan?.x || 70, targetPage.pan?.y || 80);
    Canvas.setStrokes(targetPage.strokes || []);

    if (targetPage.type === 'erd') {
      // Build visual ERD cards on canvas if empty or requested
      renderErdCanvas(targetPage);
    } else {
      // Load regular widgets
      if (!targetPage.items || targetPage.items.length === 0) {
        if (targetPage.imported) {
          Widgets.loadItems([]);
        } else if (targetPage.id === 'page_1') {
          loadDefaultLesson1Widgets();
        } else if (targetPage.id === 'page_2') {
          loadDefaultLesson2Widgets();
        } else {
          Widgets.loadItems([]);
        }
      } else {
        Widgets.loadItems(targetPage.items);
      }
    }

    renderPageTabs();
    if (window.Widgets && targetPage.type === 'erd') {
      Widgets.updateErdConnectors();
    }
    if (window.App) window.App.showToast(`Страница: ${targetPage.title}`);
  }

  function addPage() {
    saveCurrentPageState();
    const newId = 'page_' + Date.now();
    const newPage = {
      id: newId,
      title: `Новая страница ${pages.length + 1}`,
      type: 'canvas',
      scale: 1,
      pan: { x: 70, y: 80 },
      strokes: [],
      items: []
    };
    pages.push(newPage);
    savePagesToStorage(true);
    switchToPage(newId, false);
  }

  function deletePage(pageId) {
    if (pages.length <= 1) {
      alert('Нельзя удалить единственную страницу!');
      return;
    }
    if (confirm('Удалить эту страницу? Все элементы на ней будут удалены.')) {
      pages = pages.filter(p => p.id !== pageId);
      if (activePageId === pageId) {
        activePageId = pages[0].id;
      }
      savePagesToStorage(true);
      switchToPage(activePageId, false);
    }
  }

  function renamePage(pageId) {
    const p = pages.find(item => item.id === pageId);
    if (!p) return;
    const newTitle = prompt('Введите название страницы:', p.title);
    if (newTitle && newTitle.trim()) {
      p.title = newTitle.trim();
      savePagesToStorage(true);
      renderPageTabs();
    }
  }

  // Render Page Tabs in Header Bar
  function renderPageTabs() {
    const container = document.getElementById('pages-tabs-container');
    if (!container) return;
    container.innerHTML = '';

    pages.forEach(p => {
      const isActive = p.id === activePageId;
      const tabBtn = document.createElement('div');
      tabBtn.className = `group flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl cursor-pointer transition select-none ${
        isActive
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`;

      const iconName = p.type === 'erd' ? 'network' : 'file-code';

      tabBtn.innerHTML = `
        <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
        <span class="page-title-text">${p.title}</span>
        ${pages.length > 1 ? `
          <button class="btn-del-page opacity-0 group-hover:opacity-100 p-0.5 hover:bg-black/20 rounded ml-1 transition" title="Удалить страницу">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        ` : ''}
      `;

      tabBtn.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-page')) return;
        switchToPage(p.id);
      });

      // Double click to rename
      tabBtn.addEventListener('dblclick', () => renamePage(p.id));

      const delBtn = tabBtn.querySelector('.btn-del-page');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deletePage(p.id);
        });
      }

      container.appendChild(tabBtn);
    });

    // Add Page Button
    const addBtn = document.createElement('button');
    addBtn.className = 'p-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition';
    addBtn.title = 'Добавить страницу';
    addBtn.innerHTML = '<i data-lucide="plus" class="w-3.5 h-3.5"></i>';
    addBtn.addEventListener('click', addPage);
    container.appendChild(addBtn);

    lucide.createIcons();
  }

  // ==========================================
  // Visual ERD Schema Builder (Interactive nodes)
  // ==========================================
  function renderErdCanvas(page) {
    const schema = DB.getSchemaMetadata();
    const tableNames = Object.keys(schema);

    if (page.items && page.items.length > 0) {
      // Filter out any dropped tables
      const filtered = page.items.filter(i => i.type !== 'erd_table' || schema[i.tableName]);
      Widgets.loadItems(filtered);
      // Check if any new tables exist in DB that don't have widgets yet
      const currentItems = Widgets.getItems();
      tableNames.forEach(tName => {
        if (!currentItems.some(i => i.type === 'erd_table' && i.tableName === tName)) {
          const currentErds = currentItems.filter(i => i.type === 'erd_table');
          const rightMostX = currentErds.reduce((max, it) => Math.max(max, it.x + it.width), 60);
          Widgets.createErdTableWidget(rightMostX + 40, 80, schema[tName]);
        }
      });
      Widgets.updateErdConnectors();
      page.items = Widgets.getItems();
      savePagesToStorage(true);
      return;
    }

    Widgets.clearAll();
    const DEFAULT_POSITIONS = {
      students: { x: 60, y: 80 },
      courses: { x: 520, y: 80 },
      enrollments: { x: 290, y: 420 }
    };

    let nextCustomX = 880;
    tableNames.forEach((tName) => {
      const tableInfo = schema[tName];
      let pos = DEFAULT_POSITIONS[tName];
      if (!pos) {
        pos = { x: nextCustomX, y: 80 };
        nextCustomX += 340;
      }
      Widgets.createErdTableWidget(pos.x, pos.y, tableInfo);
    });

    // Helpful instruction sticky on ERD tab
    Widgets.createSticky(
      660, 420,
      "🗺️ Реляционная схема базы данных:\n\n• Синим (PK) отмечен первичный ключ таблицы.\n• Зеленым (FK) отмечены внешние ключи, связывающие таблицы стрелками!\n• Вкладка обновляется автоматически при добавлении колонок.\n• Нажмите «+ Колонка» или «+ Таблица» вверху для добавления структуры без модальных окон.",
      "blue",
      320,
      190,
      'seed_erd_sticky'
    );

    Widgets.updateErdConnectors();
    page.items = Widgets.getItems();
    savePagesToStorage(true);
  }

  // Default seed for Lesson 1
  function loadDefaultLesson1Widgets() {
    Widgets.clearAll();

    // 1. Checklist progress widget
    Widgets.createChecklistWidget(60, 40, null, 320, 320, 'seed_l1_checklist');

    // 2. Drag & Drop SQL builder
    Widgets.createSqlBuilderWidget(380, 40, [], [], 520, 380, 'seed_l1_builder');

    // 3. Assignment card: Target SELECT
    Widgets.createAssignmentWidget(
      880, 40,
      "Задание 1: Выборка отличников",
      "Напишите запрос, который выбирает имя (`name`) и факультет (`department`) всех студентов с средним баллом (`gpa`) больше 3.7.",
      "SELECT name, department FROM students WHERE gpa > 3.7;",
      "SELECT name, department FROM students WHERE gpa > 3.7;",
      640, 540,
      'seed_l1_assignment'
    );

    // 4. Sticky Note for teaching
    Widgets.createSticky(
      60, 360,
      "💡 Подсказка к уроку 1:\n\nВ SQL регистр ключевых слов не имеет значения, но принято писать SELECT и FROM большими буквами. Для фильтрации используйте WHERE.",
      "yellow",
      280,
      200,
      'seed_l1_sticky'
    );

    // 5. Quiz Widget
    Widgets.createQuizWidget(
      380, 380,
      "Что вернет условие WHERE year = 2 AND gpa >= 3.5?",
      [
        "Студентов 2 курса с GPA от 3.5",
        "Всех второкурсников независимо от оценок",
        "Студентов любого курса, если GPA >= 3.5",
        "Ошибку синтаксиса"
      ],
      0,
      "Оператор AND требует истинности обоих условий одновременно: курс равен 2 и GPA не менее 3.5.",
      360, 320,
      'seed_l1_quiz'
    );

    const p1 = pages.find(p => p.id === 'page_1');
    if (p1) {
      p1.items = Widgets.getItems();
      savePagesToStorage(true);
    }
  }

  // Default seed for Lesson 2
  function loadDefaultLesson2Widgets() {
    Widgets.clearAll();

    // Assignment 2: INNER JOIN
    Widgets.createAssignmentWidget(
      60, 40,
      "Задание 2: Студенты и их курсы (JOIN)",
      "Объедините таблицы `students` и `enrollments`, чтобы вывести имя студента (`name`) и его оценку (`grade`).",
      "SELECT s.name, e.grade\nFROM students s\nJOIN enrollments e ON s.id = e.student_id;",
      "SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.id = e.student_id;",
      640, 540,
      'seed_l2_assignment'
    );

    // SQL Playground widget
    Widgets.createSqlWidget(
      640, 40,
      "Песочница JOIN & GROUP BY",
      `SELECT c.title, COUNT(e.id) AS students_count, ROUND(AVG(e.grade), 1) AS avg_grade\nFROM courses c\nJOIN enrollments e ON c.id = e.course_id\nGROUP BY c.title\nORDER BY avg_grade DESC;`,
      520,
      440,
      'seed_l2_sql'
    );

    // Sticky Note
    Widgets.createSticky(
      60, 520,
      "🔑 Главное о JOIN:\n\nКлюч связи между students и enrollments — это s.id = e.student_id.",
      "purple",
      280,
      180,
      'seed_l2_sticky'
    );

    const p2 = pages.find(p => p.id === 'page_2');
    if (p2) {
      p2.items = Widgets.getItems();
      savePagesToStorage(true);
    }
  }

  function resetCurrentPage() {
    const p = getActivePage();
    if (!p) return;
    p.scale = 1;
    p.pan = { x: 70, y: 80 };
    p.strokes = [];
    Canvas.setScale(1);
    Canvas.setPan(70, 80);
    Canvas.setStrokes([]);
    Widgets.clearAll();

    if (p.id === 'page_1') {
      loadDefaultLesson1Widgets();
    } else if (p.id === 'page_2') {
      loadDefaultLesson2Widgets();
    } else if (p.type === 'erd' || p.id === 'page_erd') {
      renderErdCanvas(p);
    } else {
      Widgets.createSticky(80, 80, `Страница: ${p.title}`, 'yellow');
    }
    p.items = Widgets.getItems();
    savePagesToStorage(true);
    renderPageTabs();
    if (window.App) window.App.showToast(`Страница «${p.title}» сброшена`);
  }

  return {
    init,
    getActivePage,
    switchToPage,
    addPage,
    deletePage,
    renamePage,
    resetCurrentPage,
    saveCurrentPageState,
    onRemotePagesUpdate,
    replaceAllPages,
    getPages: () => pages
  };
})();

window.Pages = Pages;
