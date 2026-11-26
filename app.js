'use strict';

(() => {
  const { stockLength, offsetMaxLength, damperLength, dampers, diffusers, isDamper, isAirOutlet, materials, ductNames, ductType, itemName, itemUnit, elbowAngles, levelLabels, sideLabels, format, positiveInteger,
    hasOutletDimensions, hasTwoEnds, branchGeometry, longSide, parseDimensions, plateThickness, hbKey, insulationText, specText,
    crossSectionText, outletSectionText, diffuserFaceText, offsetDetails, twoEndDetails, orderPieces, orderQuantity, quantityText, orderItems, missingDetails } = orderCalculations;
  const storageKey = 'hanguk-duct-order-v1';
  const byId = id => document.getElementById(id);
  const form = byId('entry-form');
  const info = byId('order-info');
  const infoLabels = { site: '현장명', supplier: '수신처', orderDate: '발주일', deliveryDate: '납품일', contact: '담당 / 연락처', address: '납품 장소' };
  const draftFields = ['type', 'width', 'height', 'neck', 'diffuserNominal', 'diffuserModel', 'length', 'cutLength', 'radius', 'rise', 'offsetLength', 'includeInlet', 'inlet', 'repeat',
    'outletWidth', 'outletHeight', 'reducerLength', 'level', 'side',
    'material', 'insulation', 'artilon', 'hb', 'reinforcement', 'reinforcementSize', 'customReinforcement', 'memo'];
  const fields = Object.fromEntries(draftFields.map(name => [name, form.elements.namedItem(name)]));
  const spiral = mountSpiralEntry();
  const partGroups = {
    rect: { button: byId('choose-rect'), picker: byId('rect-part-picker'), type: 'straight' },
    spiral: { button: byId('choose-spiral'), picker: byId('spiral-part-picker'), type: 'spiral' },
    outlet: { button: byId('choose-outlet'), picker: byId('outlet-part-picker'), type: 'grille' }
  };
  const choiceDefaults = { insulation: 'none', reinforcement: 'no' };
  const supportsReinforcement = type => type === 'straight' || Boolean(elbowAngles[type]);
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format();
  const historyDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' });
  const newState = (hb, records = [], drafts = []) => ({ meta: { orderDate: today() }, runs: [], hb, draft: {}, records, drafts,
    activeRecordId: null, activeDraftId: null });
  const dimensions = () => {
    const diffuser = diffusers[fields.type.value];
    if (diffuser && fields.diffuserNominal.value !== 'legacy') {
      const model = selectedDiffuserModel();
      if (!model) return null;
      return diffuser.roundFace ? { width: model.face } : { width: model.face, height: model.face };
    }
    const width = Number(fields.width.value);
    const height = Number(fields.height.value);
    if (diffuser?.roundFace) return positiveInteger(width) ? { width } : null;
    return positiveInteger(width) && positiveInteger(height) ? { width, height } : null;
  };
  let storageIssue = '';
  let state = loadState();
  let editingId = null;
  let lastHbContext = '';
  let items = [];
  let legacyDiffuserType;
  const mobilePdf = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
    || matchMedia('(max-width: 760px) and (pointer: coarse)').matches;

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return newState({});
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.runs) && data.meta && data.hb && data.draft) {
        return { ...newState({}), ...data, records: Array.isArray(data.records) ? data.records : [],
          drafts: Array.isArray(data.drafts) ? data.drafts : [] };
      }
      throw new Error('Invalid saved order');
    } catch (error) {
      storageIssue = '이전 작업을 불러올 수 없습니다.';
      return newState({});
    }
  }

  function currentDraft() {
    const draft = { ...Object.fromEntries(draftFields.map(name => [name, fields[name].value])), editingId };
    if (fields.type.value === 'spiral') draft.spiral = spiral.read();
    if (!diffusers[draft.type]) {
      draft.diffuserNominal = '';
      draft.diffuserModel = '';
    } else if (draft.diffuserNominal !== 'legacy') {
      draft.width = '';
      draft.height = '';
      draft.neck = '';
    }
    return draft;
  }

  function saveState() {
    const order = currentOrder();
    const oldDrafts = state.drafts;
    const oldDraftId = state.activeDraftId;
    state.draft = order.draft;
    updateDraft(order);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageIssue = '';
    } catch (error) {
      state.drafts = oldDrafts;
      state.activeDraftId = oldDraftId;
      storageIssue = '자동 저장을 사용할 수 없습니다.';
    }
    renderSaveStatus();
    renderHistory();
    return !storageIssue;
  }

  function renderSaveStatus() {
    const status = byId('save-status');
    status.textContent = storageIssue || (state.runs.length ? '이 브라우저에 자동 저장됨' : '이 브라우저에 자동 저장');
    status.classList.toggle('save-error', Boolean(storageIssue));
  }

  function el(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }

  function currentOrder() {
    const meta = Object.fromEntries(Object.keys(infoLabels).map(name => [name, state.meta[name] || '']));
    return { meta, runs: state.runs, draft: currentDraft() };
  }

  function hasWork({ meta, runs, draft }) {
    const round = draft.spiral;
    const spiralWork = round && (round.model !== 'SP' || round.material !== 'galvanized' || round.spiralThickness
      || round.params.d1 || round.params.length !== 4000);
    return runs.length || Object.keys(infoLabels).some(name => name !== 'orderDate' && meta[name])
      || (meta.orderDate || '') !== today()
      || spiralWork || draft.repeat !== '1' || draftFields.some(name => !['type', 'repeat'].includes(name) && draft[name] && draft[name] !== choiceDefaults[name]);
  }

  function hasUnsavedWork(order) {
    const saved = state.records.find(record => record.id === state.activeRecordId);
    if (!saved) return Boolean(hasWork(order));
    const values = saved.order.draft;
    const draft = Object.fromEntries(draftFields.map(name => [name, values[name] || choiceDefaults[name] || '']));
    if (wasManualDiffuser(values)) draft.diffuserNominal = 'legacy';
    draft.editingId = values.editingId ?? null;
    if (values.spiral) draft.spiral = values.spiral;
    return JSON.stringify(order) !== JSON.stringify({ ...saved.order, draft });
  }

  function updateDraft(order) {
    const id = state.activeDraftId;
    if (!hasUnsavedWork(order)) {
      if (id) {
        state.drafts = state.drafts.filter(draft => draft.id !== id);
        state.activeDraftId = null;
      }
      return;
    }
    const previous = state.drafts.find(draft => draft.id === id);
    if (previous && JSON.stringify(previous.order) === JSON.stringify(order)) return;
    const draft = { id: id || crypto.randomUUID(), recordId: state.activeRecordId, savedAt: new Date().toISOString(),
      order: structuredClone(order) };
    state.drafts = [draft, ...state.drafts.filter(item => item.id !== draft.id)];
    state.activeDraftId = draft.id;
  }

  function warnBeforeLeave(event) {
    event.preventDefault();
    event.returnValue = '';
  }

  function renderHistory() {
    const order = currentOrder();
    const unsaved = hasUnsavedWork(order);
    if (unsaved) window.addEventListener('beforeunload', warnBeforeLeave);
    else window.removeEventListener('beforeunload', warnBeforeLeave);

    byId('save-order').disabled = !unsaved;
    byId('export-history').disabled = !state.records.length && !state.drafts.length;
    byId('close-order').disabled = !state.activeRecordId && !unsaved;
    byId('history-count').textContent = `${format(state.records.length + state.drafts.length)}건`;
    renderRecordList(state.drafts, 'draft', 'draft-history-list', 'draft-history-empty', state.activeDraftId);
    renderRecordList(state.records, 'saved', 'history-list', 'history-empty', state.activeDraftId ? null : state.activeRecordId);
  }

  function historyTitle({ order: { meta } }) {
    return meta.site || meta.supplier || '현장명 미입력';
  }

  function renderRecordList(records, kind, listId, emptyId, activeId) {
    byId(emptyId).hidden = Boolean(records.length);
    const list = byId(listId);
    const previousScroll = list.scrollTop;
    const entries = document.createDocumentFragment();
    for (const record of records) {
      const { runs, draft } = record.order;
      const entry = el('li');
      const button = el('button', undefined, 'history-record');
      button.type = 'button';
      button.dataset.recordId = record.id;
      button.dataset.kind = kind;
      const active = record.id === activeId;
      if (active) button.setAttribute('aria-current', 'true');
      const title = historyTitle(record);
      const hasDimensions = positiveInteger(draft.width) && positiveInteger(draft.height);
      const details = runs.length ? quantityText(runs, orderQuantity) : draft.spiral ? itemName(draft.spiral)
        : hasDimensions ? `${ductNames[draft.type] || '덕트'} ${crossSectionText(draft)}` : '작성 중';
      button.append(el('strong', title), el('small', `${historyDate.format(new Date(record.savedAt))} · ${details}${active ? ' · 현재 작업' : ''}`));
      const remove = el('button', '삭제', 'button secondary compact history-delete');
      remove.type = 'button';
      remove.dataset.recordId = record.id;
      remove.dataset.kind = kind;
      remove.dataset.historyAction = 'delete';
      remove.setAttribute('aria-label', `${title} ${kind === 'draft' ? '초안' : '발주서'} 삭제`);
      entry.append(button, remove);
      entries.append(entry);
    }
    list.replaceChildren(entries);
    list.scrollTop = previousScroll;
  }

  function saveRecord() {
    const order = currentOrder();
    if (!hasUnsavedWork(order)) return true;
    const oldRecords = state.records;
    const oldId = state.activeRecordId;
    const id = oldId || crypto.randomUUID();
    const record = { id, savedAt: new Date().toISOString(), order: structuredClone(order) };
    state.records = [record, ...oldRecords.filter(previous => previous.id !== id)];
    state.activeRecordId = id;
    if (!saveState()) {
      state.records = oldRecords;
      state.activeRecordId = oldId;
      renderHistory();
      byId('history-status').textContent = '브라우저에 발주 기록을 저장할 수 없습니다.';
      return false;
    }
    byId('history-status').textContent = '발주 기록에 저장했습니다.';
    return true;
  }

  function askDialog(dialog) {
    dialog.returnValue = '';
    const decision = new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
    dialog.showModal();
    return decision;
  }

  async function confirmSave(action, keepCurrent = false) {
    if (!hasUnsavedWork(currentOrder())) return true;
    const dialog = byId('save-dialog');
    if (dialog.open) return false;
    byId('save-dialog-title').textContent = `${action} 전에 발주를 저장할까요?`;
    byId('discard-action').textContent = keepCurrent
      ? (mobilePdf ? '기록 저장 없이 PDF 만들기' : '기록 저장 없이 인쇄·PDF')
      : '임시저장으로 남기기';
    const result = await askDialog(dialog);
    if (result === 'skip') return keepCurrent || saveState();
    return result === 'save' && saveRecord();
  }

  async function deleteHistoryRecord(id, kind) {
    const deletingDraft = kind === 'draft';
    const record = (deletingDraft ? state.drafts : state.records).find(item => item.id === id);
    const dialog = byId('delete-history-dialog');
    if (!record || dialog.open) return;
    byId('delete-history-description').textContent = `‘${historyTitle(record)}’ ${deletingDraft ? '초안' : '발주서'}를 목록에서 삭제합니다.`;
    if (await askDialog(dialog) !== 'delete') return;

    const previous = state;
    const removingActiveRecord = !deletingDraft && id === state.activeRecordId;
    const resetForm = deletingDraft ? id === state.activeDraftId : removingActiveRecord && !hasUnsavedWork(currentOrder());
    const records = deletingDraft ? state.records : state.records.filter(item => item.id !== id);
    const drafts = deletingDraft ? state.drafts.filter(item => item.id !== id)
      : state.drafts.map(item => item.recordId === id ? { ...item, recordId: null } : item);
    state = resetForm ? newState(state.hb, records, drafts)
      : { ...state, records, drafts, activeRecordId: removingActiveRecord ? null : state.activeRecordId };
    if (resetForm) restoreOrderForm();

    const status = byId('history-status');
    if (!saveState()) {
      state = previous;
      if (resetForm) restoreOrderForm();
      renderHistory();
      status.textContent = '삭제하지 못했습니다. 브라우저에 기록을 저장할 수 없습니다.';
    } else {
      status.textContent = '발주 기록을 삭제했습니다.';
    }
    byId('history-title').focus({ preventScroll: true });
  }

  function setMessage(message, error = false) {
    const node = byId('form-message');
    node.textContent = message;
    node.hidden = !message;
    node.classList.toggle('error', error);
  }

  function readConditions(geometry) {
    if (isAirOutlet(geometry.type)) return { material: null, insulation: 'none', artilon: null };
    const insulation = fields.insulation.value || choiceDefaults.insulation;
    return { material: geometry.type === 'spiral' ? geometry.material : fields.material.value, insulation,
      artilon: insulation === 'artilon' && Number(fields.artilon.value) > 0 ? Number(fields.artilon.value) : null };
  }

  function wasManualDiffuser(values) {
    return Boolean(diffusers[values.type] && (!values.diffuserNominal || values.diffuserNominal === 'legacy')
      && (values.width || values.height || values.neck));
  }

  function selectedDiffuserModel() {
    return diffusers[fields.type.value]?.models.find(model => model.code === fields.diffuserModel.value
      && String(model.nominal) === fields.diffuserNominal.value);
  }

  function syncDiffuser(nominal, code) {
    const type = fields.type.value;
    const diffuser = diffusers[type];
    const panel = byId('diffuser-fields');
    panel.hidden = !diffuser;
    panel.disabled = !diffuser;
    if (!diffuser) return;
    const nominalField = fields.diffuserNominal;
    const modelField = fields.diffuserModel;
    const legacy = type === legacyDiffuserType;
    const signature = `${type}/${legacy}`;
    nominal ??= nominalField.dataset.choices === signature ? nominalField.value : '';
    code ??= modelField.value;
    if (nominalField.dataset.choices !== signature) {
      const sizes = [...new Set(diffuser.models.map(model => model.nominal))].sort((a, b) => a - b);
      nominalField.replaceChildren(new Option('호칭 지름 선택', ''), ...sizes.map(size => new Option(`Ø${format(size)}`, size)));
      if (legacy) nominalField.append(new Option('기존 입력 규격', 'legacy'));
      nominalField.dataset.choices = signature;
    }
    nominalField.value = nominal;
    if (!nominalField.value) nominalField.value = '';
    const models = diffuser.models.filter(model => String(model.nominal) === nominalField.value);
    const modelSignature = `${type}/${nominalField.value}`;
    if (modelField.dataset.choices !== modelSignature) {
      modelField.replaceChildren(new Option('Face(D) / 모델 선택', ''), ...models.map(model =>
        new Option(`${diffuserFaceText(type, model.face)} · ${model.code}`, model.code)));
      modelField.dataset.choices = modelSignature;
    }
    const multiple = models.length > 1;
    modelField.closest('label').hidden = !multiple;
    modelField.required = multiple;
    modelField.disabled = !multiple;
    modelField.value = models.length === 1 ? models[0].code : models.some(model => model.code === code) ? code : '';
    const model = selectedDiffuserModel();
    byId('diffuser-spec').hidden = !model;
    if (!model) return;
    byId('diffuser-face').textContent = `${diffuserFaceText(type, model.face)} mm`;
    byId('diffuser-neck').textContent = `Ø${format(model.neck)} mm`;
    byId('diffuser-code').textContent = model.code;
  }

  function readGeometry(size) {
    const type = fields.type.value;
    if (type === 'spiral') return spiral.read();
    if (elbowAngles[type]) return { type, radius: fields.radius.value === '' ? null : Number(fields.radius.value) };
    if (type === 'offset') {
      const choice = fields.includeInlet.value;
      const inlet = choice === 'yes' ? Number(fields.inlet.value) : choice === 'no' ? null : undefined;
      return { type, rise: Number(fields.rise.value), length: Number(fields.offsetLength.value), inlet,
        equalEndStraights: choice === 'yes' ? true : undefined };
    }
    if (type === 'reducer') return { type, length: Number(fields.reducerLength.value), outletWidth: Number(fields.outletWidth.value),
      outletHeight: Number(fields.outletHeight.value), level: fields.level.value, side: fields.side.value };
    if (type === 'branch') return branchGeometry(size);
    if (isDamper(type)) return { type, length: damperLength };
    if (diffusers[type]) {
      const model = selectedDiffuserModel();
      return model ? { type, neck: model.neck, diffuserNominal: model.nominal, diffuserModel: model.code }
        : { type, neck: fields.diffuserNominal.value === 'legacy' ? Number(fields.neck.value) : null };
    }
    if (isAirOutlet(type)) return { type };
    return { type: 'straight', length: Number(fields.length.value),
      cutLength: fields.cutLength.value === '' ? undefined : Number(fields.cutLength.value) };
  }

  function validGeometry(geometry) {
    const { type, length, radius, rise, inlet, level, side, cutLength } = geometry;
    if (type === 'spiral') return spiralCatalog.valid(geometry) && ['galvanized', 'galvalume', 'sts304'].includes(geometry.material);
    if (elbowAngles[type]) return Number.isSafeInteger(radius) && radius >= 0;
    if (type === 'offset') return positiveInteger(length) && length <= offsetMaxLength && positiveInteger(rise)
      && (inlet === null || (positiveInteger(inlet) && inlet < length / 2));
    if (type === 'reducer') return hasOutletDimensions(geometry) && positiveInteger(length)
      && Object.hasOwn(levelLabels, level) && Object.hasOwn(sideLabels, side);
    if (type === 'branch') return hasOutletDimensions(geometry);
    if (isDamper(type)) return length === damperLength;
    if (diffusers[type]) return positiveInteger(geometry.neck);
    if (isAirOutlet(type)) return true;
    return positiveInteger(length) && (cutLength === undefined || positiveInteger(cutLength));
  }

  function measurementDescription(measurements) {
    return measurements.filter(([name, value]) => positiveInteger(value) || (name === 'R' && value === 0))
      .map(([name, value]) => `${name} ${format(value)} mm`).join(', ');
  }

  function syncGeometry(geometry) {
    const { type } = geometry;
    const straight = type === 'straight';
    const round = type === 'spiral';
    const offset = type === 'offset';
    const reducer = type === 'reducer';
    const branch = type === 'branch';
    const damper = isDamper(type);
    const airOutlet = isAirOutlet(type);
    const diffuser = diffusers[type];
    const manualDiffuser = diffuser && fields.diffuserNominal.value === 'legacy';
    const showSection = !round && (!diffuser || manualDiffuser);
    const selectedGroup = round ? partGroups.spiral : airOutlet ? partGroups.outlet : partGroups.rect;
    selectedGroup.type = type;
    for (const group of Object.values(partGroups)) {
      const selected = group === selectedGroup;
      group.button.setAttribute('aria-pressed', String(selected));
      group.picker.hidden = !selected;
    }
    const twoEnds = hasTwoEnds(type);
    const choice = fields.includeInlet.value;
    const useInlet = offset && choice === 'yes';
    for (const [name, visible] of [['width', showSection], ['height', showSection && !diffuser?.roundFace], ['neck', Boolean(manualDiffuser)], ['length', straight], ['cutLength', straight], ['radius', Boolean(elbowAngles[type])], ['rise', offset],
      ['offsetLength', offset], ['inlet', useInlet], ['outletWidth', reducer], ['outletHeight', reducer], ['reducerLength', reducer]]) {
      fields[name].closest('label').hidden = !visible;
      fields[name].disabled = !visible;
      fields[name].required = visible && name !== 'cutLength';
    }
    byId('width-label').textContent = diffuser?.roundFace ? '전면 지름 Ø' : diffuser ? '전면 가로' : '가로';
    byId('height-label').textContent = diffuser ? '전면 세로' : '세로';
    const cTooLong = useInlet && geometry.length > 0 && geometry.inlet >= geometry.length / 2;
    fields.inlet.setCustomValidity(cTooLong ? '양쪽 C의 합은 총길이 L보다 작아야 합니다.' : '');
    fields.offsetLength.setCustomValidity(offset && geometry.length > offsetMaxLength
      ? `고바이 총길이 L은 ${format(offsetMaxLength)} mm 이하여야 합니다.` : '');
    byId('offset-options').hidden = !offset;
    byId('offset-options').disabled = !offset;
    byId('two-end-inlet-label').hidden = !twoEnds;
    byId('two-end-inlet-label').textContent = branch ? '기준 단면 (A × B)' : '입구 (A × B)';
    byId('reducer-fields').hidden = !reducer;
    byId('reducer-level-options').disabled = !reducer;
    byId('reducer-side-options').disabled = !reducer;
    byId('branch-fields').hidden = !branch;
    byId('branch-outlet').textContent = branch && hasOutletDimensions(geometry) ? outletSectionText(geometry) : '—';
    byId('damper-length').hidden = !damper;
    byId('damper-length-value').textContent = `${format(damperLength)} mm`;
    byId('rect-material-section').hidden = round || airOutlet;
    byId('rect-material-options').disabled = round || airOutlet;
    byId('insulation-section').hidden = airOutlet;
    byId('insulation-options').disabled = airOutlet;
    byId('quantity-label').textContent = straight ? '같은 구간 수' : `수량 (${itemUnit(geometry)})`;
    byId('fitting-guide').hidden = false;
    byId('stock-label').hidden = !straight;
    if (straight) byId('stock-label').textContent = geometry.cutLength === undefined
      ? `정척 ${format(stockLength)} mm` : positiveInteger(geometry.cutLength) ? `분할 기준 ${format(geometry.cutLength)} mm` : '분할 기준 확인';
    byId('cut-title').textContent = straight ? '절단 미리보기' : '제작 규격 미리보기';
    const diagram = byId('fitting-diagram');
    if (round) {
      const model = spiralCatalog.get(geometry.model);
      const diagramChoice = JSON.stringify([model.id, geometry.params]);
      if (diagram.dataset.choice !== diagramChoice) {
        diagram.dataset.choice = diagramChoice;
        drawSpiralDiagram(diagram, model, geometry.params);
      }
      const measurements = model.fields.map(field => [field.label, geometry.params[field.key]]);
      if (model.fixedLength) measurements.push(['L', model.fixedLength]);
      const values = measurementDescription(measurements);
      diagram.setAttribute('aria-label', values ? `${model.name} 치수 안내 그림. ${values}` : `${model.name} 치수 안내 그림`);
      byId('fitting-caption').textContent = model.damper ? model.name : `${model.code} · ${model.name}`;
      return;
    }
    const size = diffuser && !manualDiffuser ? dimensions() ?? {} : {
      width: positiveInteger(fields.width.value) ? Number(fields.width.value) : undefined,
      height: positiveInteger(fields.height.value) ? Number(fields.height.value) : undefined,
    };
    const diagramChoice = JSON.stringify([geometry, size, choice]);
    if (diagram.dataset.choice !== diagramChoice) {
      diagram.dataset.choice = diagramChoice;
      drawFittingDiagram(diagram, geometry, size, choice);
    }
    const descriptions = {
      straight: ['직관 치수 그림. 가로 × 세로와 구간 전체 길이 L', 'L은 한 구간의 전체 길이입니다.'],
      elbow: ['90도 엘보 3D 그림. 접합 단면 가로 × 세로와 안쪽 반경 R', '90° 엘보의 R은 안쪽 반경입니다.'],
      elbow45: ['45도 엘보 3D 그림. 접합 단면 가로 × 세로와 안쪽 반경 R', '45° 엘보의 R은 안쪽 반경입니다.'],
      offset: [`고바이 치수 그림. 가로 × 세로, 양쪽 밑면의 높이 차 H, 총길이 L${useInlet && positiveInteger(geometry.inlet) ? ', 양쪽에 동일하게 적용하는 직선 치수 C' : ''}`,
        'H는 양쪽 밑면의 높이 차, L은 접합면 사이 수평 길이입니다.'],
      reducer: ['레두샤 측면과 평면. 입구 A × B, 출구 C × D, 길이 L과 선택한 정렬을 표시합니다.',
        '편심 방향은 입구에서 출구를 바라보는 기준입니다.'],
      branch: ['본관 옆면에 붙는 짧은 분기구. 분기측 A × B, 본관 접속 C × D, 길이 L을 표시합니다.',
        '본관 접속부는 장변에 150 mm를 더합니다. 가로와 세로가 같으면 가로를 늘립니다.'],
    };
    const [description, caption] = descriptions[type] ?? [`${ductNames[type]} 치수 그림`,
      damper ? `몸체 길이 L은 ${format(damperLength)} mm입니다.`
        : diffuser ? '호칭 지름을 선택하면 Face(D)와 목 지름(A)이 표시됩니다.' : '가로와 세로를 입력하세요.'];
    const outlet = branch ? '본관 접속' : '출구';
    const endMeasurements = twoEnds ? [[`${outlet} 가로`, geometry.outletWidth], [`${outlet} 세로`, geometry.outletHeight]] : [];
    const face = diffuser?.roundFace ? [['Face(D) 전면 지름', size.width]]
      : diffuser ? [['Face(D) 가로', size.width], ['Face(D) 세로', size.height]] : [['가로', size.width], ['세로', size.height]];
    const values = measurementDescription([...face, ['실제 목 지름(A)', geometry.neck], ['R', geometry.radius],
      ['H', geometry.rise], ['L', geometry.length], ['C', useInlet ? geometry.inlet : null], ['분할 기준', geometry.cutLength], ...endMeasurements]);
    diagram.setAttribute('aria-label', values ? `${description}. ${values}` : description);
    byId('fitting-caption').textContent = caption;
  }

  function syncForm(restoreHb = false) {
    const round = fields.type.value === 'spiral';
    spiral.sync(round);
    syncDiffuser();
    const size = round ? null : dimensions();
    const geometry = readGeometry(size);
    syncGeometry(geometry);
    const twoEnds = hasTwoEnds(geometry.type);
    const section = round ? (validGeometry(geometry) ? geometry : null)
      : size && (!twoEnds || hasOutletDimensions(geometry)) ? { ...size, ...geometry } : null;
    const conditions = readConditions(geometry);
    const useInsulation = ['rubber', 'artilon'].includes(conditions.insulation);
    const isArtilon = conditions.insulation === 'artilon';
    const allowReinforcement = supportsReinforcement(geometry.type);
    const useReinforcement = allowReinforcement && fields.reinforcement.value === 'yes';
    const customReinforcement = useReinforcement && fields.reinforcementSize.value === 'custom';
    const key = section && useInsulation ? hbKey({ ...section, ...conditions }) : '';
    const context = section && useInsulation ? hbKey({ ...section, ...conditions, artilon: conditions.artilon ?? 'unknown' }) : '';
    const registeredHb = key ? state.hb[key] : '';

    byId('insulation-fields').hidden = !useInsulation;
    byId('artilon-field').hidden = !isArtilon;
    fields.artilon.disabled = !isArtilon;
    fields.hb.disabled = !section || !useInsulation;
    fields.artilon.setCustomValidity(fields.artilon.value && Number(fields.artilon.value) <= 0 ? '두께는 0보다 커야 합니다.' : '');
    if (context !== lastHbContext && !restoreHb) fields.hb.value = registeredHb || '';
    lastHbContext = context;

    const hint = byId('hb-hint');
    if (!section) hint.textContent = round ? '제품 모델과 치수를 먼저 선택하세요.'
      : twoEnds ? '양쪽 단면의 가로와 세로를 확인하세요.' : '가로와 세로를 먼저 입력하세요.';
    else if (!key) hint.textContent = '아티론 두께를 입력하면 같은 조건의 HB값을 다시 불러올 수 있습니다.';
    else if (registeredHb && fields.hb.value === registeredHb) hint.textContent = '같은 규격·보온 조건에 저장된 HB값입니다.';
    else hint.textContent = '확인한 HB값은 같은 규격·보온 조건에 자동으로 불러옵니다.';

    byId('reinforcement-choice').hidden = !allowReinforcement;
    byId('reinforcement-choice').disabled = !allowReinforcement;
    byId('reinforcement-fields').hidden = !useReinforcement;
    byId('custom-field').hidden = !customReinforcement;
    fields.reinforcementSize.disabled = !useReinforcement;
    fields.reinforcementSize.required = useReinforcement;
    fields.customReinforcement.disabled = !customReinforcement;
    fields.customReinforcement.required = customReinforcement;
    fields.memo.placeholder = allowReinforcement ? '예: 보강 위치, 설치 지시사항' : '예: 현장 요청사항';

    const plate = plateThickness(conditions.material, section);
    const sideLabel = twoEnds ? '양쪽 최대 장변' : '장변';
    byId('long-side').textContent = section && !round ? `${sideLabel} ${format(longSide(section))} mm` : `${sideLabel} —`;
    byId('plate').textContent = plate ? `판두께 ${plate}T` : '판두께 —';
    renderPreview(size, geometry);
  }

  function renderPreview(size, geometry) {
    const container = byId('cut-preview');
    const type = geometry.type;
    const run = { ...size, ...geometry, repeat: Number(fields.repeat.value) };
    const pieces = validGeometry(run) ? orderPieces(run) : [];
    if ((!size && type !== 'spiral') || !pieces.length) {
      const elbowHint = '가로 × 세로, 안쪽 반경 R, 수량을 입력하세요.';
      const hints = {
        straight: '가로 × 세로와 전체 길이를 입력하면 정척과 짧은 덕트의 수량이 계산됩니다.',
        elbow: elbowHint,
        elbow45: elbowHint,
        offset: '가로 × 세로, H, L을 입력하고 C 적용 여부를 선택하세요.',
        reducer: '입구·출구 치수와 길이 L을 입력하고 높이·폭 정렬을 선택하세요.',
        branch: '기준 단면의 가로와 세로를 입력하면 반대쪽 치수가 계산됩니다.',
        spiral: '제품 모델에서 지름과 치수를 선택하면 발주 규격이 표시됩니다.',
      };
      const tooLong = type === 'offset' && geometry.length > offsetMaxLength;
      const diffuserHint = fields.diffuserNominal.value === 'legacy' ? '전면 치수와 목 지름을 입력하세요.'
        : fields.diffuserModel.required ? 'Face(D) 또는 모델을 선택하세요.' : '호칭 지름을 선택하세요.';
      const hint = tooLong ? `고바이 총길이 L은 ${format(offsetMaxLength)} mm까지 입력할 수 있습니다.`
        : hints[type] ?? (diffusers[type] ? diffuserHint : '가로와 세로를 입력하세요.');
      container.replaceChildren(el('p', hint, 'cut-empty'));
      return;
    }
    const list = el('ul', undefined, 'cut-list');
    for (const piece of pieces) {
      const row = el('li');
      const splitLength = geometry.cutLength ?? stockLength;
      const label = type === 'straight' ? (piece.length === splitLength ? (geometry.cutLength === undefined ? '정척' : '기준 길이') : '짧은 덕트')
        : type === 'spiral' ? spiralCatalog.get(geometry.model).code : dampers[type] ?? ductNames[type];
      row.append(el('span', label, 'piece-type'), el('strong', specText({ ...run, ...piece })),
        el('span', `${format(piece.quantity)} ${itemUnit(geometry)}`, 'piece-quantity'));
      list.append(row);
    }
    container.replaceChildren(list);
  }

  function fillForm(values = {}, id = null) {
    form.reset();
    spiral.restore(values.spiral);
    // Earlier drafts saved the cross-section in a single text field.
    const restored = { ...(values.size ? parseDimensions(values.size) : null), ...values };
    legacyDiffuserType = wasManualDiffuser(restored) ? restored.type : undefined;
    for (const name of draftFields) {
      if (name !== 'diffuserNominal' && name !== 'diffuserModel' && restored[name] !== undefined && restored[name] !== null) fields[name].value = restored[name];
    }
    syncDiffuser(restored.diffuserNominal || (legacyDiffuserType ? 'legacy' : ''), restored.diffuserModel || '');
    fields.width.setCustomValidity('');
    fields.height.setCustomValidity('');
    editingId = id;
    byId('entry-title').textContent = id ? '덕트 품목 수정' : '덕트 품목 입력';
    byId('add-entry').textContent = id ? '변경사항 적용' : '발주에 추가';
    byId('cancel-edit').hidden = !id;
    setMessage('');
    syncForm(true);
  }

  function restoreInfo() {
    for (const input of info.querySelectorAll('input')) input.value = state.meta[input.name] || '';
  }

  function rowNotes(item) {
    const notes = [];
    const missing = missingDetails(item);
    if (missing.length) notes.push(`${missing.join(' · ')} 확인 필요`);
    if (item.memo) notes.push(item.memo);
    return notes.join(' / ');
  }

  function rowData(item) {
    if (isAirOutlet(item.type)) return [specText(item), '—', '', '—', '—', '—', rowNotes(item)];
    return [specText(item), materials[item.material].label, item.plate === null ? '제품 표준' : `${item.plate}T`,
      insulationText(item), item.insulation !== 'none' ? item.hb || '확인 필요' : '—',
      item.reinforcementWidth ? `${format(item.reinforcementWidth)} mm` : '미설치', rowNotes(item)];
  }

  function buildTable(print = false) {
    const headers = print
      ? ['번호', '품명', '규격 (mm)', '강판 / 판두께', '단위', '수량', '보온재 / HB', '갈바 보강 / 비고']
      : ['품명 / 규격 (mm)', '강판 / 판두께', '수량', '보온재 / HB', '갈바 보강 / 비고'];
    const table = el('table', undefined, print ? 'print-table' : 'items-table');
    const headerRow = table.createTHead().insertRow();
    if (!print) {
      table.setAttribute('role', 'table');
      table.tHead.setAttribute('role', 'rowgroup');
      headerRow.setAttribute('role', 'row');
    }
    for (const label of headers) {
      const heading = el('th', label);
      heading.scope = 'col';
      headerRow.append(heading);
    }
    const body = table.createTBody();
    if (!print) body.setAttribute('role', 'rowgroup');
    for (const [index, item] of items.entries()) {
      const [spec, material, thickness, insulation, hb, reinforcement, notes] = rowData(item);
      const row = body.insertRow();
      if (print) {
        row.insertCell().textContent = index + 1;
        row.insertCell().textContent = itemName(item);
      }
      const specCell = row.insertCell();
      if (!print) specCell.append(el('div', itemName(item), 'table-item-name'));
      const twoEnds = hasTwoEnds(item.type);
      const specificationClass = item.type === 'spiral' ? 'table-spec spiral-spec' : 'table-spec';
      specCell.append(el('strong', twoEnds || item.type === 'offset' ? crossSectionText(item) : spec, specificationClass));
      if (twoEnds) {
        specCell.append(el('strong', ` → ${outletSectionText(item)}`, 'table-spec second-section'),
          el('small', twoEndDetails(item), 'table-fitting-details'));
      }
      if (item.type === 'offset') specCell.append(el('small', offsetDetails(item), 'table-fitting-details'));
      if (item.type === 'spiral') specCell.append(el('small', spiralCatalog.details(item, format).join(' · '), 'table-fitting-details'));
      row.insertCell().append(el('span', material), el('small', thickness));
      const unit = itemUnit(item);
      if (print) row.insertCell().textContent = unit;
      const quantity = el('strong', print ? format(item.quantity) : `${format(item.quantity)} ${unit}`, 'table-quantity');
      row.insertCell().append(quantity);
      const insulationCell = row.insertCell();
      insulationCell.append(el('span', insulation));
      if (item.insulation !== 'none') insulationCell.append(el('small', item.hb ? `HB · ${hb}` : 'HB 확인 필요', item.hb ? '' : 'unconfirmed'));
      const reinforcementCell = row.insertCell();
      reinforcementCell.append(el('span', reinforcement));
      if (notes) reinforcementCell.append(el('small', notes, missingDetails(item).length ? 'unconfirmed' : ''));
      if (!print) {
        row.setAttribute('role', 'row');
        for (const [column, cell] of [...row.cells].entries()) {
          cell.setAttribute('role', 'cell');
          if (column >= 3) {
            const mobileLabel = el('span', column === 3 ? '보온재' : '갈바 보강', 'mobile-label');
            mobileLabel.setAttribute('aria-hidden', 'true');
            cell.prepend(mobileLabel);
          }
        }
      }
    }
    return table;
  }

  function renderRuns() {
    const list = byId('run-list');
    list.replaceChildren();
    for (const [index, run] of state.runs.entries()) {
      const row = el('li', undefined, 'run');
      const text = el('div');
      const type = ductType(run);
      const details = isAirOutlet(type) ? []
        : [materials[run.material].label, insulationText(run), run.reinforcementWidth ? `보강 ${format(run.reinforcementWidth)} mm` : '보강 미설치'];
      const quantity = run.repeat > 1 ? ` · ${format(run.repeat)}${type === 'straight' ? '구간' : ` ${itemUnit(run)}`}` : '';
      text.append(el('strong', `${itemName(run)} · ${specText(run)}${quantity}`));
      if (details.length) text.append(el('small', details.join(' · ')));
      const controls = el('div', undefined, 'run-actions');
      for (const [action, label] of [['edit', '수정'], ['delete', '삭제']]) {
        const button = el('button', label, 'button secondary compact');
        button.type = 'button';
        button.dataset.action = action;
        button.dataset.id = run.id;
        button.setAttribute('aria-label', `${index + 1}번째 품목 ${label}`);
        controls.append(button);
      }
      row.append(text, controls);
      list.append(row);
    }
    byId('run-size').textContent = `${format(state.runs.length)}건`;
    byId('empty-runs').hidden = Boolean(state.runs.length);
  }

  function refreshOrder() {
    items = orderItems(state.runs);
    const unconfirmed = items.filter(item => missingDetails(item).length).length;
    byId('order-size').textContent = `${format(items.length)}개 품목 · 총 ${quantityText(items)}`;
    const warning = byId('order-warning');
    warning.textContent = unconfirmed ? `${format(unconfirmed)}개 품목의 사양을 확인해 주세요. 해당 발주서는 확인용으로 표시됩니다.` : '';
    warning.hidden = !unconfirmed;
    byId('empty-order').hidden = Boolean(items.length);
    const table = byId('order-table');
    table.hidden = !items.length;
    table.replaceChildren(buildTable());
    byId('print').disabled = !items.length;
    byId('csv').disabled = !items.length;
    renderRuns();
  }

  function preparePrint() {
    const sheet = byId('print-sheet');
    const masthead = el('header', undefined, 'print-heading');
    const title = el('div');
    title.append(el('p', '한국닥트', 'print-brand'), el('h1', '발주서'));
    masthead.append(title);
    if (items.some(item => missingDetails(item).length)) masthead.append(el('p', '확인용 · 사양 미확정', 'print-status'));
    const infoGrid = el('dl', undefined, 'print-info');
    for (const [name, label] of Object.entries(infoLabels)) {
      const line = el('div');
      line.append(el('dt', label), el('dd', state.meta[name] || '—'));
      infoGrid.append(line);
    }
    sheet.replaceChildren(masthead, infoGrid, buildTable(true), el('p', `합계 ${quantityText(items)}`, 'print-total'));
    return sheet;
  }

  function exportCsv() {
    const rows = [['한국닥트 발주서'], ...Object.entries(infoLabels).map(([key, label]) => [label, state.meta[key] || ''])];
    if (items.some(item => missingDetails(item).length)) rows.push(['문서 상태', '확인용 · 사양 미확정']);
    rows.push([], ['품명', '규격 (mm)', '강판', '판두께', '단위', '수량', '보온재', 'HB', '갈바 보강', '비고']);
    for (const item of items) {
      const [spec, material, thickness, insulation, hb, reinforcement, notes] = rowData(item);
      const details = item.type === 'spiral' ? spiralCatalog.details(item, format) : [];
      if (notes) details.push(notes);
      rows.push([itemName(item), spec, material, thickness, itemUnit(item), item.quantity, insulation, hb, reinforcement, details.join(' / ')]);
    }
    const csv = rows.map(row => row.map(cell => {
      let value = String(cell);
      if (/^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = `'${value}`;
      return `"${value.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const suffix = (state.meta.site || state.meta.orderDate || today()).replace(/[<>:"/\\|?*]/g, '_');
    downloadFile(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), `한국닥트 발주서 - ${suffix}.csv`);
  }

  function exportHistory() {
    const backup = {
      format: 'hanguk-duct-order-history',
      version: 1,
      records: state.records,
      drafts: state.drafts
    };
    downloadFile(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `한국닥트 발주 기록 - ${today()}.json`);
  }

  function downloadFile(data, filename) {
    const url = URL.createObjectURL(data);
    const link = el('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  form.addEventListener('input', () => {
    fields.width.setCustomValidity('');
    fields.height.setCustomValidity('');
    setMessage('');
    syncForm();
    saveState();
  });

  for (const group of Object.values(partGroups)) {
    group.button.addEventListener('click', () => {
      if (fields.type.value === group.type) return;
      fields.type.value = group.type;
      form.dispatchEvent(new Event('input'));
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const round = fields.type.value === 'spiral';
    const size = round ? null : dimensions();
    if (!size && !round) {
      if (diffusers[fields.type.value] && fields.diffuserNominal.value !== 'legacy') {
        setMessage('디퓨저의 호칭 지름과 모델을 확인해 주세요.', true);
        return;
      }
      const invalidField = positiveInteger(fields.width.value) ? fields.height : fields.width;
      invalidField.setCustomValidity('치수는 양의 정수로 입력하세요.');
      invalidField.reportValidity();
      return;
    }
    const geometry = readGeometry(size);
    const repeat = Number(fields.repeat.value);
    const conditions = readConditions(geometry);
    const previous = state.runs.find(run => run.id === editingId);
    let reinforcementWidth = null;
    if (supportsReinforcement(geometry.type) && fields.reinforcement.value === 'yes') {
      reinforcementWidth = Number(fields.reinforcementSize.value === 'custom' ? fields.customReinforcement.value : fields.reinforcementSize.value);
    } else if (!supportsReinforcement(geometry.type) && previous && ductType(previous) === geometry.type) {
      reinforcementWidth = previous.reinforcementWidth ?? null;
    }
    if (reinforcementWidth !== null && !positiveInteger(reinforcementWidth)) {
      setMessage('보강 폭을 양의 정수로 입력하세요.', true);
      return;
    }
    if (!validGeometry(geometry)) {
      setMessage('제작 치수를 확인해 주세요.', true);
      return;
    }
    const quantity = orderQuantity({ ...geometry, repeat });
    const otherQuantity = state.runs.filter(run => run.id !== editingId).reduce((sum, run) => sum + orderQuantity(run), 0);
    if (!quantity || !Number.isSafeInteger(otherQuantity + quantity)) {
      setMessage('길이와 수량을 확인해 주세요. 계산 가능한 범위를 초과했습니다.', true);
      return;
    }
    const run = { id: editingId || crypto.randomUUID(), ...size, ...geometry, repeat, ...conditions,
      hb: conditions.insulation === 'none' ? '' : fields.hb.value.trim(), reinforcementWidth, memo: fields.memo.value.trim() };
    const key = hbKey(run);
    if (key && run.hb) state.hb[key] = run.hb;
    const wasEditing = Boolean(editingId);
    if (wasEditing) state.runs = state.runs.map(previous => previous.id === editingId ? run : previous);
    else state.runs.push(run);
    fillForm({ type: run.type, spiral: round && spiralCatalog.isOrderModel(run.model) ? { model: run.model } : undefined });
    saveState();
    refreshOrder();
    setMessage(wasEditing ? '품목을 수정했습니다.' : `${itemName(run)} 품목을 추가했습니다.`);
    focusPart(true);
  });

  function focusPart(preventScroll = false) {
    const field = fields.type.value === 'spiral' ? form.querySelector('[name="spiral-d1"]')
      : diffusers[fields.type.value] ? fields.diffuserNominal : fields.width;
    field.focus({ preventScroll });
  }

  byId('run-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const run = state.runs.find(item => item.id === button.dataset.id);
    if (!run) return;
    if (button.dataset.action === 'edit') {
      const preset = [100, 150, 200].includes(run.reinforcementWidth);
      const type = ductType(run);
      fillForm({ ...run, type, length: type === 'straight' ? run.length : '',
        spiral: type === 'spiral' ? run : undefined,
        offsetLength: type === 'offset' ? run.length : '', includeInlet: type === 'offset' ? (run.inlet === null ? 'no' : 'yes') : '',
        reducerLength: type === 'reducer' ? run.length : '',
        reinforcement: run.reinforcementWidth ? 'yes' : 'no',
        reinforcementSize: run.reinforcementWidth ? (preset ? run.reinforcementWidth : 'custom') : '',
        customReinforcement: preset ? '' : run.reinforcementWidth }, run.id);
      saveState();
      focusPart();
      return;
    }
    if (!window.confirm(`${itemName(run)} ${specText(run)} 품목을 발주에서 삭제할까요?`)) return;
    state.runs = state.runs.filter(item => item.id !== run.id);
    if (editingId === run.id) fillForm();
    saveState();
    refreshOrder();
  });

  byId('cancel-edit').addEventListener('click', () => {
    fillForm();
    saveState();
    focusPart();
  });

  info.addEventListener('input', event => {
    state.meta[event.target.name] = event.target.value.trim();
    saveState();
  });

  async function clearOrder(action) {
    if (!await confirmSave(action)) return;
    state = newState(state.hb, state.records, state.drafts);
    fillForm();
    restoreInfo();
    saveState();
    refreshOrder();
    info.querySelector('input').focus();
  }

  function restoreOrderForm() {
    restoreInfo();
    fillForm(state.draft, state.runs.some(run => run.id === state.draft.editingId) ? state.draft.editingId : null);
    refreshOrder();
  }

  byId('new-order').addEventListener('click', () => clearOrder('새 발주'));
  byId('close-order').addEventListener('click', () => clearOrder('닫기'));
  byId('save-order').addEventListener('click', saveRecord);
  byId('export-history').addEventListener('click', exportHistory);

  byId('order-history').addEventListener('click', async event => {
    const button = event.target.closest('button[data-record-id]');
    if (!button) return;
    const { recordId: id, kind } = button.dataset;
    if (button.dataset.historyAction === 'delete') {
      await deleteHistoryRecord(id, kind);
      return;
    }
    const openingDraft = kind === 'draft';
    if (openingDraft ? id === state.activeDraftId : id === state.activeRecordId && !state.activeDraftId) return;
    if (!await confirmSave('다른 기록 열기')) return;
    const record = (openingDraft ? state.drafts : state.records).find(item => item.id === id);
    if (!record) return;
    state = { ...state, ...structuredClone(record.order), activeRecordId: openingDraft ? record.recordId : id,
      activeDraftId: openingDraft ? id : null };
    restoreOrderForm();
    saveState();
    byId('history-status').textContent = openingDraft ? '임시저장한 발주를 열었습니다.' : '저장한 발주를 열었습니다.';
  });

  const printButton = byId('print');
  if (mobilePdf) printButton.textContent = '발주서 PDF 저장';

  printButton.addEventListener('click', async () => {
    const status = byId('pdf-status');
    status.textContent = '';
    if (!items.length || !await confirmSave(mobilePdf ? 'PDF 저장' : '인쇄·PDF', true)) return;
    const sheet = preparePrint();
    if (!mobilePdf) {
      window.print();
      return;
    }
    printButton.disabled = true;
    status.textContent = 'PDF를 만드는 중입니다.';
    try {
      const suffix = (state.meta.site || state.meta.orderDate || today()).replace(/[<>:"/\\|?*]/g, '_');
      showPdfFile(await orderPdf.create(sheet), `한국닥트 발주서 - ${suffix}.pdf`);
      status.textContent = '';
    } catch (error) {
      status.textContent = 'PDF를 만들 수 없습니다. 다시 시도해 주세요.';
    } finally {
      printButton.disabled = !items.length;
    }
  });

  function showPdfFile(blob, filename) {
    const dialog = byId('pdf-dialog');
    const download = byId('download-pdf');
    const open = byId('open-pdf');
    const share = byId('share-pdf');
    const message = byId('pdf-dialog-message');
    const url = URL.createObjectURL(blob);
    const file = new File([blob], filename, { type: 'application/pdf' });
    download.href = open.href = url;
    download.download = filename;
    message.textContent = '';
    share.hidden = !navigator.canShare?.({ files: [file] });
    share.onclick = async () => {
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        if (error.name !== 'AbortError') message.textContent = '공유할 수 없습니다. 파일을 저장하거나 열어 주세요.';
      }
    };
    dialog.addEventListener('close', () => {
      share.onclick = null;
      download.removeAttribute('href');
      open.removeAttribute('href');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, { once: true });
    dialog.showModal();
  }

  window.addEventListener('beforeprint', preparePrint);
  byId('csv').addEventListener('click', exportCsv);

  for (const canvas of form.querySelectorAll('canvas[data-part]')) drawPartThumbnail(canvas, canvas.dataset.part);
  restoreOrderForm();
  if (hasUnsavedWork(currentOrder())) saveState();
  else {
    renderSaveStatus();
    renderHistory();
  }
})();
