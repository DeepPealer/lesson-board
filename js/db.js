/**
 * =========================================================
 * MiroSQL Studio - Database Engine, DDL/DML & Semantic Checker
 * =========================================================
 */

const DB = (() => {
  const listeners = [];

  function emitChange(eventData) {
    listeners.forEach(fn => {
      try { fn(eventData); } catch (e) { console.error('DB listener error:', e); }
    });
  }

  // Realistic mock data pools
  const FIRST_NAMES = [
    'Алексей', 'Мария', 'Дмитрий', 'Анна', 'Артем', 'Екатерина',
    'Иван', 'София', 'Михаил', 'Полина', 'Максим', 'Виктория',
    'Lucas', 'Emma', 'Oliver', 'Mia', 'Liam', 'Sophia'
  ];
  const LAST_NAMES = [
    'Иванов', 'Смирнова', 'Кузнецов', 'Попова', 'Васильев', 'Петрова',
    'Соколов', 'Михайлова', 'Новиков', 'Федорова', 'Морозов', 'Волкова',
    'Smith', 'Johnson', 'Brown', 'Taylor', 'Miller', 'Davis'
  ];
  const DEPARTMENTS = [
    'Computer Science', 'Data Science', 'Software Engineering',
    'Applied Mathematics', 'Information Security', 'AI & Robotics'
  ];
  const COURSE_TEMPLATES = [
    { title: 'Реляционные базы данных и SQL', dept: 'Computer Science', credits: 4 },
    { title: 'Алгоритмы и структуры данных', dept: 'Software Engineering', credits: 5 },
    { title: 'Машинное обучение и нейросети', dept: 'Data Science', credits: 4 },
    { title: 'Архитектура веб-приложений', dept: 'Software Engineering', credits: 3 },
    { title: 'Математическая статистика', dept: 'Applied Mathematics', credits: 4 },
    { title: 'Кибербезопасность систем', dept: 'Information Security', credits: 3 },
    { title: 'Разработка на JavaScript & TypeScript', dept: 'Software Engineering', credits: 3 }
  ];
  const INSTRUCTORS = [
    'д.т.н. Прохоров В.С.', 'к.ф.-м.н. Васильева Е.А.', 'Prof. Andrew Ng',
    'доц. Кузнецов М.И.', 'Dr. Alan Turing', 'к.т.н. Соколова О.Д.'
  ];

  // In-memory relational storage
  let tables = {
    students: [
      { id: 1, name: 'Алексей Иванов', email: 'alex@univ.edu', department: 'Computer Science', gpa: 3.92, year: 3 },
      { id: 2, name: 'Мария Смирнова', email: 'maria@univ.edu', department: 'Data Science', gpa: 3.85, year: 2 },
      { id: 3, name: 'Дмитрий Кузнецов', email: 'dmitry@univ.edu', department: 'Software Engineering', gpa: 3.42, year: 4 },
      { id: 4, name: 'Анна Попова', email: 'anna@univ.edu', department: 'Applied Mathematics', gpa: 3.96, year: 1 },
      { id: 5, name: 'Артем Васильев', email: 'artem@univ.edu', department: 'Computer Science', gpa: 2.88, year: 2 },
      { id: 6, name: 'Екатерина Петрова', email: 'katya@univ.edu', department: 'Information Security', gpa: 3.65, year: 3 },
      { id: 7, name: 'Иван Соколов', email: 'ivan@univ.edu', department: 'Applied Mathematics', gpa: 3.12, year: 1 },
      { id: 8, name: 'София Михайлова', email: 'sofia@univ.edu', department: 'Data Science', gpa: 4.00, year: 4 }
    ],
    courses: [
      { id: 101, title: 'Реляционные базы данных и SQL', instructor: 'д.т.н. Прохоров В.С.', credits: 4, department: 'Computer Science' },
      { id: 102, title: 'Алгоритмы и структуры данных', instructor: 'Dr. Alan Turing', credits: 5, department: 'Software Engineering' },
      { id: 103, title: 'Машинное обучение и нейросети', instructor: 'Prof. Andrew Ng', credits: 4, department: 'Data Science' },
      { id: 104, title: 'Математическая статистика', instructor: 'к.ф.-м.н. Васильева Е.А.', credits: 4, department: 'Applied Mathematics' },
      { id: 105, title: 'Кибербезопасность систем', instructor: 'доц. Кузнецов М.И.', credits: 3, department: 'Information Security' }
    ],
    enrollments: [
      { id: 1, student_id: 1, course_id: 101, grade: 96, attendance_pct: 98 },
      { id: 2, student_id: 1, course_id: 102, grade: 92, attendance_pct: 95 },
      { id: 3, student_id: 2, course_id: 101, grade: 84, attendance_pct: 88 },
      { id: 4, student_id: 2, course_id: 103, grade: 95, attendance_pct: 94 },
      { id: 5, student_id: 3, course_id: 101, grade: 78, attendance_pct: 75 },
      { id: 6, student_id: 3, course_id: 102, grade: 81, attendance_pct: 82 },
      { id: 7, student_id: 4, course_id: 104, grade: 98, attendance_pct: 100 },
      { id: 8, student_id: 5, course_id: 101, grade: 65, attendance_pct: 62 },
      { id: 9, student_id: 6, course_id: 105, grade: 89, attendance_pct: 90 },
      { id: 10, student_id: 7, course_id: 104, grade: 72, attendance_pct: 78 },
      { id: 11, student_id: 8, course_id: 101, grade: 99, attendance_pct: 100 },
      { id: 12, student_id: 8, course_id: 103, grade: 97, attendance_pct: 98 }
    ]
  };

  let tableSchemas = {
    students: [
      { name: 'id', type: 'INT', isPK: true, notNull: true, unique: true },
      { name: 'name', type: 'STRING', notNull: true },
      { name: 'email', type: 'STRING', notNull: true, unique: true },
      { name: 'department', type: 'STRING' },
      { name: 'gpa', type: 'FLOAT' },
      { name: 'year', type: 'INT' }
    ],
    courses: [
      { name: 'id', type: 'INT', isPK: true, notNull: true, unique: true },
      { name: 'title', type: 'STRING', notNull: true },
      { name: 'instructor', type: 'STRING' },
      { name: 'credits', type: 'INT', notNull: true },
      { name: 'department', type: 'STRING' }
    ],
    enrollments: [
      { name: 'id', type: 'INT', isPK: true, notNull: true, unique: true },
      { name: 'student_id', type: 'INT', isFK: true, fkTarget: 'students.id', notNull: true },
      { name: 'course_id', type: 'INT', isFK: true, fkTarget: 'courses.id', notNull: true },
      { name: 'grade', type: 'INT' },
      { name: 'attendance_pct', type: 'INT' }
    ]
  };

  // Sync with AlaSQL engine
  function syncToAlaSQL() {
    if (typeof window.alasql === 'undefined') return;
    try {
      Object.keys(tables).forEach(tableName => {
        try { window.alasql(`DROP TABLE IF EXISTS ${tableName}`); } catch (e) {}
        try {
          window.alasql(`CREATE TABLE ${tableName}`);
          if (window.alasql.databases && window.alasql.databases.alasql && window.alasql.databases.alasql.tables) {
            window.alasql.databases.alasql.tables[tableName].data = JSON.parse(JSON.stringify(tables[tableName]));
          }
        } catch (e) {
          console.error(`Failed to sync table ${tableName} to AlaSQL:`, e);
        }
      });
    } catch (err) {
      console.error('Error syncing tables to AlaSQL:', err);
    }
  }

  function init() {
    const saved = localStorage.getItem('mirosql_db_tables_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          tables = parsed;
        }
      } catch (e) {
        console.error('Failed to parse saved DB:', e);
      }
    }

    const savedSchemas = localStorage.getItem('mirosql_db_schemas_v3');
    if (savedSchemas) {
      try {
        const parsedS = JSON.parse(savedSchemas);
        if (parsedS && typeof parsedS === 'object') {
          tableSchemas = parsedS;
        }
      } catch (e) {}
    }

    // Auto-repair any null or missing IDs across tables
    Object.keys(tables).forEach(tName => {
      if (Array.isArray(tables[tName])) {
        let maxId = 0;
        tables[tName].forEach(r => {
          const val = Number(r.id);
          if (!isNaN(val) && val > maxId) maxId = val;
        });
        tables[tName].forEach(r => {
          if (r.id === null || r.id === undefined || r.id === '' || isNaN(Number(r.id))) {
            maxId++;
            r.id = maxId;
          } else {
            r.id = Number(r.id) || r.id;
          }
        });
      }
    });

    syncToAlaSQL();
  }

  function persist() {
    localStorage.setItem('mirosql_db_tables_v3', JSON.stringify(tables));
    localStorage.setItem('mirosql_db_schemas_v3', JSON.stringify(tableSchemas));
    syncToAlaSQL();
    if (window.Collab) Collab.broadcastDbUpdate(tables, tableSchemas);
  }

  function onRemoteDbUpdate(remoteTables, remoteSchemas) {
    if (!remoteTables) return;
    tables = remoteTables;
    if (remoteSchemas) tableSchemas = remoteSchemas;
    syncToAlaSQL();
    listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('DB listener error:', e); }
    });
    if (window.Widgets) {
      Widgets.refreshErdWidgets();
      Widgets.updateErdConnectors();
    }
  }

  // Auto Data Generators
  function generateStudents(count = 10) {
    if (!tables.students) tables.students = [];
    const startId = tables.students.length > 0 ? Math.max(...tables.students.map(s => Number(s.id) || 0)) + 1 : 1;

    for (let i = 0; i < count; i++) {
      const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const dept = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)];
      const gpa = Number((2.5 + Math.random() * 1.5).toFixed(2));
      const year = Math.floor(Math.random() * 4) + 1;
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(Math.random() * 90 + 10)}@univ.edu`;

      tables.students.push({
        id: startId + i,
        name: `${fn} ${ln}`,
        email,
        department: dept,
        gpa,
        year
      });
    }
    persist();
    emitChange({ type: 'generate', table: 'students', count });
  }

  function generateCourses(count = 3) {
    if (!tables.courses) tables.courses = [];
    const startId = tables.courses.length > 0 ? Math.max(...tables.courses.map(c => Number(c.id) || 0)) + 1 : 101;

    for (let i = 0; i < count; i++) {
      const template = COURSE_TEMPLATES[Math.floor(Math.random() * COURSE_TEMPLATES.length)];
      const instructor = INSTRUCTORS[Math.floor(Math.random() * INSTRUCTORS.length)];
      tables.courses.push({
        id: startId + i,
        title: `${template.title} (Поток ${i + 1})`,
        instructor,
        credits: template.credits,
        department: template.dept
      });
    }
    persist();
    emitChange({ type: 'generate', table: 'courses', count });
  }

  function generateEnrollments(count = 15) {
    if (!tables.enrollments) tables.enrollments = [];
    if (!tables.students || tables.students.length === 0) generateStudents(10);
    if (!tables.courses || tables.courses.length === 0) generateCourses(3);

    const startId = tables.enrollments.length > 0 ? Math.max(...tables.enrollments.map(e => Number(e.id) || 0)) + 1 : 1;

    for (let i = 0; i < count; i++) {
      const student = tables.students[Math.floor(Math.random() * tables.students.length)];
      const course = tables.courses[Math.floor(Math.random() * tables.courses.length)];
      const grade = Math.floor(55 + Math.random() * 45);
      const attendance = Math.floor(60 + Math.random() * 40);

      tables.enrollments.push({
        id: startId + i,
        student_id: student.id,
        course_id: course.id,
        grade,
        attendance_pct: attendance
      });
    }
    persist();
    emitChange({ type: 'generate', table: 'enrollments', count });
  }

  function seedAllDefaultData() {
    tables = {
      students: [
        { id: 1, name: 'Алексей Иванов', email: 'alex@univ.edu', department: 'Computer Science', gpa: 3.92, year: 3 },
        { id: 2, name: 'Мария Смирнова', email: 'maria@univ.edu', department: 'Data Science', gpa: 3.85, year: 2 },
        { id: 3, name: 'Дмитрий Кузнецов', email: 'dmitry@univ.edu', department: 'Software Engineering', gpa: 3.42, year: 4 },
        { id: 4, name: 'Анна Попова', email: 'anna@univ.edu', department: 'Applied Mathematics', gpa: 3.96, year: 1 },
        { id: 5, name: 'Артем Васильев', email: 'artem@univ.edu', department: 'Computer Science', gpa: 2.88, year: 2 },
        { id: 6, name: 'Екатерина Петрова', email: 'katya@univ.edu', department: 'Information Security', gpa: 3.65, year: 3 },
        { id: 7, name: 'Иван Соколов', email: 'ivan@univ.edu', department: 'Applied Mathematics', gpa: 3.12, year: 1 },
        { id: 8, name: 'София Михайлова', email: 'sofia@univ.edu', department: 'Data Science', gpa: 4.00, year: 4 }
      ],
      courses: [
        { id: 101, title: 'Реляционные базы данных и SQL', instructor: 'д.т.н. Прохоров В.С.', credits: 4, department: 'Computer Science' },
        { id: 102, title: 'Алгоритмы и структуры данных', instructor: 'Dr. Alan Turing', credits: 5, department: 'Software Engineering' },
        { id: 103, title: 'Машинное обучение и нейросети', instructor: 'Prof. Andrew Ng', credits: 4, department: 'Data Science' },
        { id: 104, title: 'Математическая статистика', instructor: 'к.ф.-м.н. Васильева Е.А.', credits: 4, department: 'Applied Mathematics' },
        { id: 105, title: 'Кибербезопасность систем', instructor: 'доц. Кузнецов М.И.', credits: 3, department: 'Information Security' }
      ],
      enrollments: [
        { id: 1, student_id: 1, course_id: 101, grade: 96, attendance_pct: 98 },
        { id: 2, student_id: 1, course_id: 102, grade: 92, attendance_pct: 95 },
        { id: 3, student_id: 2, course_id: 101, grade: 84, attendance_pct: 88 },
        { id: 4, student_id: 2, course_id: 103, grade: 95, attendance_pct: 94 },
        { id: 5, student_id: 3, course_id: 101, grade: 78, attendance_pct: 75 },
        { id: 6, student_id: 3, course_id: 102, grade: 81, attendance_pct: 82 },
        { id: 7, student_id: 4, course_id: 104, grade: 98, attendance_pct: 100 },
        { id: 8, student_id: 5, course_id: 101, grade: 65, attendance_pct: 62 },
        { id: 9, student_id: 6, course_id: 105, grade: 89, attendance_pct: 90 },
        { id: 10, student_id: 7, course_id: 104, grade: 72, attendance_pct: 78 },
        { id: 11, student_id: 8, course_id: 101, grade: 99, attendance_pct: 100 },
        { id: 12, student_id: 8, course_id: 103, grade: 97, attendance_pct: 98 }
      ]
    };
    persist();
    emitChange({ type: 'seed' });
  }

  // ==========================================
  // DDL: Structure Management (Columns & Tables)
  // ==========================================
  function createTable(tableName, columns = ['id', 'name']) {
    tableName = tableName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!tableName) throw new Error('Имя таблицы не может быть пустым');
    if (tables[tableName]) throw new Error(`Таблица "${tableName}" уже существует`);

    // Normalize column descriptors: [{ name: 'id', type: 'INT', notNull: true, unique: true, isPK: true }, ...]
    const colDefs = columns.map(c => {
      if (typeof c === 'string') {
        const isPK = c.toLowerCase() === 'id';
        const isFK = c.endsWith('_id');
        const type = (isPK || isFK) ? 'INT' : 'STRING';
        return { name: c, type, isPK, isFK, notNull: isPK, unique: isPK };
      }
      const isPK = c.name.toLowerCase() === 'id' || !!c.isPK;
      const isFK = !!c.isFK || (!isPK && c.name.endsWith('_id'));
      return {
        name: c.name,
        type: c.type || 'STRING',
        isPK,
        isFK,
        fkTarget: c.fkTarget || null,
        notNull: isPK || !!c.notNull,
        unique: isPK || !!c.unique
      };
    });

    if (!colDefs.some(c => c.name.toLowerCase() === 'id')) {
      colDefs.unshift({ name: 'id', type: 'INT', isPK: true, notNull: true, unique: true });
    }

    tableSchemas[tableName] = colDefs;
    tables[tableName] = [];
    persist();
    emitChange({ type: 'createTable', table: tableName, columns: colDefs });
  }

  function dropTable(tableName) {
    if (!tables[tableName]) return;
    delete tables[tableName];
    delete tableSchemas[tableName];
    persist();
    emitChange({ type: 'dropTable', table: tableName });
  }

  function clearTable(tableName) {
    if (!tables[tableName]) return;
    tables[tableName] = [];
    persist();
    emitChange({ type: 'clearTable', table: tableName });
  }

  function addColumn(tableName, colName, colType = 'STRING', defaultVal = '', options = {}) {
    colName = colName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!tables[tableName]) throw new Error(`Таблица "${tableName}" не найдена`);
    if (!colName) throw new Error('Имя колонки не может быть пустым');

    if (!tableSchemas[tableName]) {
      const rows = tables[tableName];
      const existingCols = rows.length > 0 ? Object.keys(rows[0]) : ['id'];
      tableSchemas[tableName] = existingCols.map(c => ({
        name: c,
        type: (c.endsWith('_id') || c === 'id') ? 'INT' : 'STRING',
        isPK: c === 'id',
        isFK: c.endsWith('_id'),
        notNull: c === 'id',
        unique: c === 'id'
      }));
    }

    if (tableSchemas[tableName].some(c => (typeof c === 'string' ? c : c.name) === colName)) {
      throw new Error(`Колонка "${colName}" уже существует в таблице "${tableName}"`);
    }

    const isFK = !!options.isFK || colName.endsWith('_id') || !!options.fkTarget;
    const colDef = {
      name: colName,
      type: colType,
      isPK: false,
      isFK: isFK,
      fkTarget: options.fkTarget || null,
      notNull: !!options.notNull,
      unique: !!options.unique
    };

    tableSchemas[tableName].push(colDef);

    tables[tableName].forEach(row => {
      let val = defaultVal;
      if (colType === 'INT') val = defaultVal === '' ? 0 : parseInt(defaultVal) || 0;
      else if (colType === 'FLOAT') val = defaultVal === '' ? 0.0 : parseFloat(defaultVal) || 0.0;
      else if (colType === 'BOOLEAN') val = defaultVal === 'true' || defaultVal === true || defaultVal === '1';
      row[colName] = val;
    });

    persist();
    emitChange({ type: 'addColumn', table: tableName, column: colName, colType, colDef });
  }

  function dropColumn(tableName, colName) {
    if (!tables[tableName]) return;
    if (colName.toLowerCase() === 'id') throw new Error('Нельзя удалить первичный ключ "id"');

    if (tableSchemas[tableName]) {
      tableSchemas[tableName] = tableSchemas[tableName].filter(c => (typeof c === 'string' ? c : c.name) !== colName);
    }
    tables[tableName].forEach(row => {
      delete row[colName];
    });
    persist();
    emitChange({ type: 'dropColumn', table: tableName, column: colName });
  }

  // ==========================================
  // DML: Cell Editing, Rows Insert & Delete
  // ==========================================
  function updateCell(tableName, rowIndex, colName, newVal) {
    if (!tables[tableName] || !tables[tableName][rowIndex]) return;
    
    // Auto-convert numeric types
    let parsedVal = newVal;
    if (typeof tables[tableName][rowIndex][colName] === 'number') {
      const num = Number(newVal);
      if (!isNaN(num)) parsedVal = num;
    }
    tables[tableName][rowIndex][colName] = parsedVal;
    persist();
    emitChange({ type: 'updateCell', table: tableName, rowIndex, colName });
  }

  function addRow(tableName, rowObj = {}) {
    if (!tables[tableName]) tables[tableName] = [];
    const tableRows = tables[tableName];

    // Guarantee auto-increment ID if missing, null, undefined, '', or NaN
    if (rowObj.id === undefined || rowObj.id === null || rowObj.id === '' || isNaN(Number(rowObj.id))) {
      let maxId = 0;
      tableRows.forEach(r => {
        const val = Number(r.id);
        if (!isNaN(val) && val > maxId) maxId = val;
      });
      rowObj.id = maxId + 1;
    } else {
      rowObj.id = Number(rowObj.id) || rowObj.id;
    }

    tableRows.push(rowObj);
    persist();
    emitChange({ type: 'insert', table: tableName, row: rowObj });
    return rowObj;
  }

  function deleteRow(tableName, index) {
    if (!tables[tableName] || index < 0 || index >= tables[tableName].length) return;
    tables[tableName].splice(index, 1);
    persist();
    emitChange({ type: 'delete', table: tableName });
  }

  // Relational Schema Extractor for ERD
  function getSchemaMetadata() {
    const schema = {};
    Object.keys(tables).forEach(tName => {
      const rows = tables[tName];
      let cols = [];
      if (tableSchemas[tName] && tableSchemas[tName].length > 0) {
        cols = tableSchemas[tName].map(c => typeof c === 'string' ? c : c.name);
      } else if (rows.length > 0) {
        cols = Object.keys(rows[0]);
      } else {
        cols = ['id'];
      }

      if (rows.length > 0) {
        Object.keys(rows[0]).forEach(c => {
          if (!cols.includes(c)) cols.push(c);
        });
      }

      schema[tName] = {
        name: tName,
        columns: cols.map(c => {
          let type = 'STRING';
          const schemaCol = tableSchemas[tName]?.find(sc => (typeof sc === 'string' ? sc : sc.name) === c);
          if (schemaCol && typeof schemaCol === 'object' && schemaCol.type) {
            type = schemaCol.type;
          } else if (rows.length > 0 && typeof rows[0][c] === 'number') {
            type = Number.isInteger(rows[0][c]) ? 'INT' : 'FLOAT';
          } else if (c.toLowerCase() === 'id' || c.endsWith('_id')) {
            type = 'INT';
          }
          const isPK = c.toLowerCase() === 'id' || !!schemaCol?.isPK;
          let isFK = !!schemaCol?.isFK || (!isPK && (c.endsWith('_id') || !!schemaCol?.fkTarget));
          let fkTarget = schemaCol?.fkTarget || null;
          if (isFK && !fkTarget) {
            const base = c.replace(/_id$/, '');
            const tableNames = Object.keys(tables);
            const candidates = [
              base + 's',
              base + 'es',
              base.endsWith('y') ? base.slice(0, -1) + 'ies' : base,
              base
            ];
            const target = candidates.find(t => tableNames.includes(t));
            if (target) fkTarget = `${target}.id`;
          }
          const notNull = isPK || !!schemaCol?.notNull;
          const unique = isPK || !!schemaCol?.unique;
          return { name: c, type, isPK, isFK, fkTarget, notNull, unique };
        }),
        rowCount: rows.length
      };
    });
    return schema;
  }

  // Relational Relationships Extractor (PK -> FK arrows)
  function getRelationships() {
    const rels = [];
    const schema = getSchemaMetadata();
    const tableNames = Object.keys(schema);

    tableNames.forEach(sourceTable => {
      const cols = schema[sourceTable].columns;
      cols.forEach(col => {
        if (col.isFK && col.fkTarget) {
          const parts = col.fkTarget.split('.');
          const targetTable = parts[0];
          const targetCol = parts[1] || 'id';
          if (tableNames.includes(targetTable)) {
            rels.push({
              id: `${sourceTable}.${col.name}__${targetTable}.${targetCol}`,
              fromTable: sourceTable,
              fromCol: col.name,
              toTable: targetTable,
              toCol: targetCol,
              label: '1 : N'
            });
          }
        }
      });
    });
    return rels;
  }

  // ==========================================
  // Pedagogical Error Explainer (Human Hints)
  // ==========================================
  function explainSqlError(rawQuery, errorMsg) {
    const q = (rawQuery || '').trim();
    const upper = q.toUpperCase();

    // Check 1: FROM placed after WHERE
    if (upper.includes('WHERE') && upper.includes('FROM') && upper.indexOf('FROM') > upper.indexOf('WHERE')) {
      return 'Подсказка: Ключевое слово FROM должно идти ПЕРЕД предложением WHERE! Правильный порядок: SELECT ... FROM ... WHERE ...';
    }

    // Check 2: Missing FROM
    if (upper.startsWith('SELECT') && !upper.includes('FROM') && !upper.match(/SELECT\s+[\d\+\-\*\/\(\)\s]+/)) {
      return 'Подсказка: Вы забыли указать таблицу! Добавьте FROM <имя_таблицы> после списка выбираемых полей.';
    }

    // Check 3: SELECT misspelled or missing
    if (!upper.startsWith('SELECT') && !upper.startsWith('INSERT') && !upper.startsWith('UPDATE') && !upper.startsWith('DELETE') && !upper.startsWith('CREATE') && !upper.startsWith('DROP')) {
      return 'Подсказка: Запрос на выборку данных должен начинаться с ключевого слова SELECT (или команды INSERT / UPDATE / DELETE).';
    }

    // Check 4: Missing comma between column names
    if (upper.match(/SELECT\s+[a-zA-Z0-9_]+\s+[a-zA-Z0-9_]+\s+FROM/)) {
      return 'Подсказка: Между именами колонок в SELECT необходимо ставить запятую! Например: SELECT name, gpa FROM students';
    }

    // Check 5: GROUP BY after ORDER BY
    if (upper.includes('GROUP BY') && upper.includes('ORDER BY') && upper.indexOf('GROUP BY') > upper.indexOf('ORDER BY')) {
      return 'Подсказка: GROUP BY должен идти ПЕРЕД ORDER BY! Сначала группируем данные, затем сортируем результат.';
    }

    // Check 6: Unknown table name
    const fromMatch = upper.match(/FROM\s+([a-zA-Z0-9_]+)/);
    if (fromMatch) {
      const t = fromMatch[1].toLowerCase();
      if (!tables[t]) {
        const available = Object.keys(tables).join(', ');
        return `Подсказка: Таблицы "${t}" не существует. Доступные таблицы в базе: ${available}`;
      }
    }

    return `Ошибка в синтаксисе SQL: ${errorMsg}`;
  }

  // ==========================================
  // Semantic Query Result Checker (For Assignments)
  // ==========================================
  function checkQueryAgainstExpected(studentQuery, expectedQuery) {
    try {
      const studentRes = executeSQL(studentQuery);
      const expectedRes = executeSQL(expectedQuery);

      if (studentRes.isMutation || expectedRes.isMutation) {
        return { success: true, message: 'Запрос модификации успешно выполнен' };
      }

      const sRows = studentRes.rows || [];
      const eRows = expectedRes.rows || [];

      // 1. Check Row Count
      if (sRows.length !== eRows.length) {
        return {
          success: false,
          message: `Несовпадение количества строк: ваш запрос вернул ${sRows.length} строк, а ожидалось ${eRows.length}. Проверьте условие WHERE или фильтрацию.`
        };
      }

      if (eRows.length === 0 && sRows.length === 0) {
        return { success: true, message: 'Запрос верный! (Оба набора пусты)' };
      }

      // 2. Check Column Names
      const sCols = Object.keys(sRows[0] || {}).map(c => c.toLowerCase());
      const eCols = Object.keys(eRows[0] || {}).map(c => c.toLowerCase());

      const missingCols = eCols.filter(c => !sCols.includes(c));
      if (missingCols.length > 0) {
        return {
          success: false,
          message: `В результате отсутствуют необходимые колонки: [${missingCols.join(', ')}]. Проверьте список полей в SELECT.`
        };
      }

      // 3. Check Row Values (order-insensitive or ordered)
      const normalizeRow = (r) => {
        const obj = {};
        Object.keys(r).forEach(k => obj[k.toLowerCase()] = String(r[k]));
        return JSON.stringify(obj, Object.keys(obj).sort());
      };

      const sSet = sRows.map(normalizeRow).sort();
      const eSet = eRows.map(normalizeRow).sort();

      for (let i = 0; i < eSet.length; i++) {
        if (sSet[i] !== eSet[i]) {
          return {
            success: false,
            message: 'Данные в строках отличаются от ожидаемых. Проверьте условия фильтрации (WHERE) или вычисляемые выражения.'
          };
        }
      }

      return {
        success: true,
        message: '🎉 Идеально! Запрос возвращает в точности правильный результат!'
      };
    } catch (err) {
      return {
        success: false,
        message: explainSqlError(studentQuery, err.message)
      };
    }
  }

  // ==========================================
  // SQL Execution Engine
  // ==========================================
  function executeSQL(rawQuery) {
    const trimmed = (rawQuery || '').trim();
    if (!trimmed) {
      throw new Error('Пустой запрос: введите SQL команду');
    }

    const cleanQuery = trimmed.replace(/;+\s*$/, '');
    const firstWord = cleanQuery.split(/\s+/)[0].toUpperCase();

    syncToAlaSQL();

    if (typeof window.alasql === 'undefined') {
      throw new Error('AlaSQL engine не загружен');
    }

    let result;
    try {
      result = window.alasql(cleanQuery);
    } catch (err) {
      throw new Error(err.message || String(err));
    }

    // Mutations
    if (['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'TRUNCATE'].includes(firstWord)) {
      if (window.alasql.databases && window.alasql.databases.alasql && window.alasql.databases.alasql.tables) {
        const alaTables = window.alasql.databases.alasql.tables;
        Object.keys(alaTables).forEach(tName => {
          if (alaTables[tName].data) {
            const dataArr = JSON.parse(JSON.stringify(alaTables[tName].data));
            let maxId = 0;
            dataArr.forEach(r => {
              const val = Number(r.id);
              if (!isNaN(val) && val > maxId) maxId = val;
            });
            dataArr.forEach(r => {
              if (r.id === null || r.id === undefined || r.id === '' || isNaN(Number(r.id))) {
                maxId++;
                r.id = maxId;
              } else {
                r.id = Number(r.id) || r.id;
              }
            });
            tables[tName] = dataArr;
            alaTables[tName].data = JSON.parse(JSON.stringify(dataArr));
          }
        });
        Object.keys(tables).forEach(tName => {
          if (!alaTables[tName]) delete tables[tName];
        });
        persist();
        emitChange({ type: 'mutation', query: firstWord });
      }

      const affected = typeof result === 'number' ? result : 1;
      return {
        isMutation: true,
        action: firstWord,
        affectedRows: affected,
        message: `Запрос [${firstWord}] успешно выполнен. Затронуто записей: ${affected}`
      };
    }

    // SELECT
    if (Array.isArray(result) && result.length === 1 && Array.isArray(result[0])) {
      result = result[0];
    }
    if (!Array.isArray(result)) {
      result = [result];
    }

    return {
      isMutation: false,
      rows: result,
      rowCount: result.length
    };
  }

  return {
    init,
    getTables: () => tables,
    getTable: (name) => tables[name] || [],
    executeSQL,
    generateStudents,
    generateCourses,
    generateEnrollments,
    seedAllDefaultData,
    createTable,
    dropTable,
    clearTable,
    addColumn,
    dropColumn,
    updateCell,
    addRow,
    deleteRow,
    getSchemaMetadata,
    getRelationships,
    explainSqlError,
    checkQueryAgainstExpected,
    onRemoteDbUpdate,
    on: (eventName, fn) => {
      if (eventName === 'change') listeners.push(fn);
    }
  };
})();

window.DB = DB;
