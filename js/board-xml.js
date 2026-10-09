/**
 * MiroSQL Board XML v1
 * Human-readable, round-trippable lesson format; safe parser with structural limits.
 */
const BoardXML = (() => {
  const FILE_LIMIT = 6 * 1024 * 1024;
  const TYPES = new Set(['sticky', 'sql', 'assignment', 'quiz', 'sql_builder', 'checklist', 'erd_table', 'image']);
  const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,99}$/;
  const DB_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
  const escape = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const attr = (name, value) => ' ' + name + '="' + escape(value) + '"';
  const at = (el, name, fallback = '') => el?.getAttribute(name) ?? fallback;
  const one = (el, name) => Array.from(el?.children || []).find(n => n.localName === name) || null;
  const many = (el, name) => Array.from(el?.children || []).filter(n => n.localName === name);
  const value = (el, name, fallback = '') => one(el, name)?.textContent ?? fallback;
  const numeric = (raw, fallback, min = -100000, max = 100000) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) throw Error('Недопустимое числовое значение: ' + raw);
    return n;
  };
  const yes = v => String(v).toLowerCase() === 'true';
  const checkName = (s, re = ID_RE) => {
    if (!re.test(s) || ['__proto__', 'prototype', 'constructor'].includes(s)) {
      throw Error('Некорректный идентификатор: ' + s);
    }
    return s;
  };
  const textLimit = (text, max = 200000) => {
    if (text.length > max) throw Error('Слишком длинное текстовое поле');
    return text;
  };
  const line = (lines, level, content) => lines.push('  '.repeat(level) + content);
  const field = (lines, level, name, text) => line(lines, level, '<' + name + '>' + escape(text) + '</' + name + '>');

  function primitive(value) {
    if (value === null || value === undefined) return ['null', ''];
    if (typeof value === 'number' && Number.isFinite(value)) return ['number', String(value)];
    if (typeof value === 'boolean') return ['boolean', String(value)];
    return ['string', String(value)];
  }
  function readPrimitive(element) {
    const type = at(element, 'type', 'string');
    const text = element.textContent || '';
    if (type === 'null') return null;
    if (type === 'boolean') {
      if (text !== 'true' && text !== 'false') throw Error('Некорректное boolean-значение');
      return text === 'true';
    }
    if (type === 'number') return numeric(text, 0, -1e15, 1e15);
    if (type !== 'string') throw Error('Неизвестный тип значения: ' + type);
    return textLimit(text, 50000);
  }
  function writeRows(lines, level, rows) {
    for (const row of rows) {
      line(lines, level, '<row>');
      for (const [name, data] of Object.entries(row)) {
        const [type, text] = primitive(data);
        line(lines, level + 1, '<cell' + attr('name', name) + attr('type', type) + '>' +
          escape(text) + '</cell>');
      }
      line(lines, level, '</row>');
    }
  }
  function parseRows(parent, limit = 5000) {
    const nodes = many(parent, 'row');
    if (nodes.length > limit) throw Error('Слишком много строк в XML');
    return nodes.map(el => {
      const row = {};
      for (const cell of many(el, 'cell')) {
        const name = checkName(at(cell, 'name'), DB_ID_RE);
        if (Object.hasOwn(row, name)) throw Error('Повторяющаяся колонка: ' + name);
        row[name] = readPrimitive(cell);
      }
      return row;
    });
  }
  function writeExecution(lines, level, execution) {
    if (!execution) return;
    const state = execution;
    const attrs = attr('kind', state.kind) +
      (state.rowCount == null ? '' : attr('row-count', state.rowCount)) +
      (state.affectedRows == null ? '' : attr('affected-rows', state.affectedRows)) +
      (state.elapsedMs == null ? '' : attr('elapsed-ms', state.elapsedMs));
    line(lines, level, '<execution' + attrs + '>');
    if (state.message !== undefined) field(lines, level + 1, 'message', state.message);
    if (state.error !== undefined) field(lines, level + 1, 'error', state.error);
    if (state.kind === 'rows') {
      line(lines, level + 1, '<rows>');
      writeRows(lines, level + 2, (state.rows || []).slice(0, 500));
      line(lines, level + 1, '</rows>');
    }
    line(lines, level, '</execution>');
  }
  function readExecution(parent) {
    const el = one(parent, 'execution');
    if (!el) return null;
    const kind = at(el, 'kind');
    if (!['rows', 'mutation', 'error'].includes(kind)) throw Error('Неизвестный тип результата SQL');
    const execution = { kind };
    if (kind === 'rows') {
      execution.rows = parseRows(one(el, 'rows'), 500);
      execution.rowCount = numeric(at(el, 'row-count'), execution.rows.length, 0, 10000000);
    } else if (kind === 'mutation') {
      execution.affectedRows = numeric(at(el, 'affected-rows'), 0, 0, 10000000);
      execution.message = textLimit(value(el, 'message'), 5000);
    } else {
      execution.error = textLimit(value(el, 'error'), 5000);
    }
    if (el.hasAttribute('elapsed-ms')) {
      execution.elapsedMs = numeric(at(el, 'elapsed-ms'), 0, 0, 1e9);
    }
    return execution;
  }

  function serialize(snapshot = null) {
    if (!snapshot) {
      Pages.saveCurrentPageState(false);
      snapshot = {
        title: document.getElementById('board-title')?.value || 'MiroSQL Board',
        activePageId: Pages.getActivePage()?.id,
        pages: Pages.getPages(),
        tables: DB.getTables(),
        schemas: DB.getTableSchemas()
      };
    }
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    line(lines, 0, '<mirosql-board' + attr('version', '1') +
      attr('title', snapshot.title || 'MiroSQL Board') +
      attr('active-page', snapshot.activePageId || snapshot.pages[0]?.id || '') + '>');
    line(lines, 1, '<database>');
    const tables = snapshot.tables || {};
    const schemas = snapshot.schemas || {};
    for (const name of new Set([...Object.keys(tables), ...Object.keys(schemas)])) {
      line(lines, 2, '<table' + attr('name', name) + '>');
      line(lines, 3, '<columns>');
      for (const col of schemas[name] || []) {
        const colObj = typeof col === 'string' ? { name: col } : col;
        line(lines, 4, '<column' + attr('name', colObj.name) +
          attr('type', colObj.type || 'STRING') +
          attr('pk', !!colObj.isPK) + attr('fk', !!colObj.isFK) +
          attr('not-null', !!colObj.notNull) + attr('unique', !!colObj.unique) +
          (colObj.fkTarget ? attr('target', colObj.fkTarget) : '') + '/>');
      }
      line(lines, 3, '</columns>');
      line(lines, 3, '<rows>');
      writeRows(lines, 4, tables[name] || []);
      line(lines, 3, '</rows>');
      line(lines, 2, '</table>');
    }
    line(lines, 1, '</database>');
    line(lines, 1, '<pages>');
    for (const page of snapshot.pages) {
      line(lines, 2, '<page' + attr('id', page.id) + attr('title', page.title) +
        attr('type', page.type || 'canvas') + attr('scale', page.scale ?? 1) +
        attr('pan-x', page.pan?.x ?? 70) + attr('pan-y', page.pan?.y ?? 80) + '>');
      line(lines, 3, '<items>');
      for (const item of page.items || []) {
        line(lines, 4, '<item' + attr('id', item.id) + attr('type', item.type) +
          attr('x', item.x ?? 0) + attr('y', item.y ?? 0) +
          attr('width', item.width ?? 300) + attr('height', item.height ?? 220) +
          attr('locked', !!item.isLocked) + '>');
        const fields = {
          sticky: ['theme', 'content'],
          sql: ['title', 'query'],
          assignment: ['title', 'prompt', 'expectedQuery', 'query'],
          quiz: ['question', 'explanation'],
          sql_builder: [],
          checklist: ['title'],
          erd_table: ['tableName'],
          image: ['src']
        }[item.type] || [];
        for (const name of fields) {
          const tag = {expectedQuery:'expected-query',tableName:'table-name'}[name] || name;
          field(lines, 5, tag, item[name] || '');
        }
        if (item.type === 'quiz') {
          field(lines, 5, 'correct-index', item.correctIdx ?? 0);
          line(lines, 5, '<options>');
          for (const option of item.options || []) field(lines, 6, 'option', option);
          line(lines, 5, '</options>');
        }
        if (item.type === 'checklist') {
          line(lines, 5, '<entries>');
          for (const entry of item.items || []) {
            line(lines, 6, '<entry' + attr('status', entry.status || 'todo') + '>' +
              escape(entry.text || '') + '</entry>');
          }
          line(lines, 5, '</entries>');
        }
        if (item.type === 'sql_builder') {
          line(lines, 5, '<slots>');
          for (const token of item.slots || []) field(lines, 6, 'slot', token);
          line(lines, 5, '</slots>');
          line(lines, 5, '<custom-blocks>');
          for (const token of item.customBlocks || []) field(lines, 6, 'block', token);
          line(lines, 5, '</custom-blocks>');
        }
        if (item.type === 'assignment') {
          line(lines, 5, '<attempts>');
          for (const attempt of item.attempts || []) {
            line(lines, 6, '<attempt' + attr('success', !!attempt.success) +
              attr('timestamp', attempt.timestamp || '') + '>');
            field(lines, 7, 'sql', attempt.sql || '');
            field(lines, 7, 'message', attempt.message || '');
            line(lines, 6, '</attempt>');
          }
          line(lines, 5, '</attempts>');
          line(lines, 5, '<comments>');
          for (const comment of item.comments || []) {
            line(lines, 6, '<comment' + attr('author', comment.author || '') + '>');
            field(lines, 7, 'snippet', comment.snippet || '');
            field(lines, 7, 'text', comment.text || '');
            line(lines, 6, '</comment>');
          }
          line(lines, 5, '</comments>');
          if (item.evaluation) {
            line(lines, 5, '<evaluation' + attr('success', !!item.evaluation.success) + '>');
            field(lines, 6, 'message', item.evaluation.message || '');
            line(lines, 5, '</evaluation>');
          }
        }
        if (item.type === 'sql' || item.type === 'sql_builder') {
          writeExecution(lines, 5, item.execution);
        }
        line(lines, 4, '</item>');
      }
      line(lines, 3, '</items>');
      line(lines, 3, '<strokes>');
      for (const stroke of page.strokes || []) {
        line(lines, 4, '<stroke' + attr('id', stroke.id) + attr('color', stroke.color || '#111827') +
          attr('size', stroke.size || 2) + '>');
        for (const point of stroke.points || []) {
          line(lines, 5, '<point' + attr('x', point.x) + attr('y', point.y) + '/>');
        }
        line(lines, 4, '</stroke>');
      }
      line(lines, 3, '</strokes>');
      line(lines, 2, '</page>');
    }
    line(lines, 1, '</pages>');
    line(lines, 0, '</mirosql-board>');
    return lines.join('\n') + '\n';
  }

  function parse(source) {
    if (typeof source !== 'string' || source.length > FILE_LIMIT) {
      throw Error('XML-файл слишком большой (максимум 6 МБ)');
    }
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(source)) throw Error('DOCTYPE и ENTITY запрещены');
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'mirosql-board') {
      throw Error('Некорректный XML проекта');
    }
    const root = doc.documentElement;
    if (at(root, 'version') !== '1') throw Error('Поддерживается только формат XML версии 1');
    const title = textLimit(at(root, 'title', 'MiroSQL Board'), 200);
    const tables = {};
    const schemas = {};
    const db = one(root, 'database');
    for (const table of many(db, 'table')) {
      const name = checkName(at(table, 'name'), DB_ID_RE);
      if (Object.hasOwn(tables, name)) throw Error('Повтор таблицы: ' + name);
      const columnNodes = many(one(table, 'columns'), 'column');
      if (columnNodes.length > 250) throw Error('Слишком много колонок');
      schemas[name] = columnNodes.map(col => ({
        name: checkName(at(col, 'name'), DB_ID_RE),
        type: textLimit(at(col, 'type', 'STRING'), 50),
        isPK: yes(at(col, 'pk')), isFK: yes(at(col, 'fk')),
        notNull: yes(at(col, 'not-null')), unique: yes(at(col, 'unique')),
        ...(at(col, 'target') ? {fkTarget:textLimit(at(col, 'target'), 200)} : {})
      }));
      tables[name] = parseRows(one(table, 'rows'));
    }
    if (Object.keys(tables).length > 50) throw Error('Слишком много таблиц');

    const pageNodes = many(one(root, 'pages'), 'page');
    if (!pageNodes.length || pageNodes.length > 50) throw Error('Должна быть хотя бы одна страница (не больше 50)');
    const usedPages = new Set();
    let count = 0;
    let pointCount = 0;
    const pages = pageNodes.map(node => {
      const id = checkName(at(node, 'id'));
      if (usedPages.has(id)) throw Error('Повтор страницы: ' + id);
      usedPages.add(id);
      const page = {
        id, title: textLimit(at(node, 'title', id), 200),
        type: at(node, 'type', 'canvas'),
        scale: numeric(at(node, 'scale'), 1, 0.15, 3.5),
        pan: { x: numeric(at(node, 'pan-x'), 70), y: numeric(at(node, 'pan-y'), 80) },
        strokes: [], items: [], imported: true
      };
      if (!['canvas', 'erd'].includes(page.type)) throw Error('Неизвестный тип страницы: ' + page.type);
      const seenItems = new Set();
      for (const itemNode of many(one(node, 'items'), 'item')) {
        if (++count > 1000) throw Error('Слишком много карточек (максимум 1000)');
        const type = at(itemNode, 'type');
        if (!TYPES.has(type)) throw Error('Неизвестный тип карточки: ' + type);
        const itemId = checkName(at(itemNode, 'id'));
        if (seenItems.has(itemId)) throw Error('Повтор карточки: ' + itemId);
        seenItems.add(itemId);
        const item = {
          id: itemId, type,
          x: numeric(at(itemNode, 'x'), 80),
          y: numeric(at(itemNode, 'y'), 80),
          width: numeric(at(itemNode, 'width'), 360, 100, 10000),
          height: numeric(at(itemNode, 'height'), 280, 100, 10000),
          isLocked: yes(at(itemNode, 'locked'))
        };
        const fields = {
          sticky:['theme','content'],sql:['title','query'],
          assignment:['title','prompt','expectedQuery','query'],
          quiz:['question','explanation'],sql_builder:[],
          checklist:['title'],erd_table:['tableName'],image:['src']
        }[type];
        for (const name of fields) {
          const tag = {expectedQuery:'expected-query',tableName:'table-name'}[name] || name;
          item[name] = textLimit(value(itemNode, tag));
        }
        if (type === 'sticky') item.theme = item.theme || 'yellow';
        if (type === 'quiz') {
          item.options = many(one(itemNode, 'options'), 'option').map(option => textLimit(option.textContent || '', 2000));
          if (item.options.length < 2 || item.options.length > 12) throw Error('В квизе должно быть 2–12 ответов');
          item.correctIdx = numeric(value(itemNode, 'correct-index'), 0, 0, item.options.length - 1);
          item.selectedIndex = null;
        }
        if (type === 'sql_builder') {
          item.slots = many(one(itemNode, 'slots'), 'slot').map(el => textLimit(el.textContent || '', 500));
          item.customBlocks = many(one(itemNode, 'custom-blocks'), 'block').map(el => textLimit(el.textContent || '', 500));
          if (item.slots.length > 200 || item.customBlocks.length > 200) throw Error('Слишком много SQL-блоков');
        }
        if (type === 'checklist') {
          item.items = many(one(itemNode, 'entries'), 'entry').map(el => ({
            text: textLimit(el.textContent || '', 2000), status: at(el, 'status', 'todo')
          }));
          if (item.items.length > 200 || item.items.some(e => !['todo','progress','done'].includes(e.status))) {
            throw Error('Некорректный список прогресса');
          }
        }
        if (type === 'erd_table') checkName(item.tableName, DB_ID_RE);
        if (type === 'image' && item.src &&
            !/^(data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s<>"]+)$/i.test(item.src)) {
          throw Error('Изображение должно быть HTTPS-ссылкой или data:image/png/jpeg/gif/webp');
        }
        if (type === 'assignment') {
          item.attempts = many(one(itemNode, 'attempts'), 'attempt').map(el => ({
            sql:textLimit(value(el,'sql')),
            success:yes(at(el,'success')),
            timestamp:textLimit(at(el,'timestamp'),100),
            message:textLimit(value(el,'message'),5000)
          }));
          item.comments = many(one(itemNode, 'comments'), 'comment').map(el => ({
            author:textLimit(at(el,'author'),200),
            snippet:textLimit(value(el,'snippet'),2000),
            text:textLimit(value(el,'text'),5000)
          }));
          if (item.attempts.length > 200 || item.comments.length > 200) {
            throw Error('Слишком много попыток или комментариев');
          }
          const evaluation = one(itemNode, 'evaluation');
          item.evaluation = evaluation
            ? {success:yes(at(evaluation,'success')),message:textLimit(value(evaluation,'message'),5000)}
            : null;
        }
        if (type === 'sql' || type === 'sql_builder') item.execution = readExecution(itemNode);
        page.items.push(item);
      }
      for (const strokeNode of many(one(node,'strokes'),'stroke')) {
        const points = many(strokeNode,'point').map(p => ({
          x:numeric(at(p,'x'),0),y:numeric(at(p,'y'),0)
        }));
        pointCount += points.length;
        if (pointCount > 20000) throw Error('Слишком много точек рисования');
        page.strokes.push({
          id:checkName(at(strokeNode,'id')),
          color:textLimit(at(strokeNode,'color','#111827'),100),
          size:numeric(at(strokeNode,'size'),2,0.1,200),
          points
        });
      }
      return page;
    });
    const activePageId = at(root, 'active-page', pages[0].id);
    if (!usedPages.has(activePageId)) throw Error('Активной страницы нет в файле');
    return {title, activePageId, pages, tables: db ? tables : null, schemas: db ? schemas : null};
  }

  function setTitle(title, broadcast = false) {
    const value = textLimit(String(title), 200);
    const input = document.getElementById('board-title');
    if (input) input.value = value;
    localStorage.setItem('mirosql_board_title_v1', value);
    if (broadcast && window.Collab) Collab.broadcastBoardTitle(value);
  }
  function init() {
    const existing = localStorage.getItem('mirosql_board_title_v1');
    if (existing) setTitle(existing, false);
  }
  function importXml(xmlText) {
    const data = parse(xmlText); // Validate the entire XML before touching the current board.
    if (data.tables) DB.replaceAllState(data.tables, data.schemas, false, false);
    Pages.replaceAllPages(data.pages, data.activePageId, true);
    setTitle(data.title, true);
    if (data.tables && window.Collab) Collab.broadcastDbUpdate(data.tables, data.schemas);
    return { pages:data.pages.length, items:data.pages.reduce((n,p) => n + p.items.length,0) };
  }
  function exportFile() {
    const xml = serialize();
    const blob = new Blob([xml], {type:'application/xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mirosql-lesson-' + new Date().toISOString().slice(0,10) + '.xml';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { init, serialize, parse, importXml, exportFile, setTitle };
})();
window.BoardXML = BoardXML;
