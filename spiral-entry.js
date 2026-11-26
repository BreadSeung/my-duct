'use strict';

function mountSpiralEntry() {
  const { format } = orderCalculations;
  const section = document.getElementById('spiral-fields');
  const pickers = ['spiral-part-picker', 'oval-part-picker', 'flex-part-picker'].map(id => document.getElementById(id));
  const ovalParts = document.getElementById('oval-parts');
  const flexParts = document.getElementById('flex-parts');
  const parts = document.getElementById('spiral-parts');
  const branches = document.getElementById('spiral-branches');
  const hangers = document.getElementById('spiral-hangers');
  const dampers = document.getElementById('spiral-dampers');
  const box = document.getElementById('spiral-dimensions');
  const material = document.getElementById('spiral-material');
  const thickness = document.getElementById('spiral-thickness');
  const finish = document.getElementById('catalog-finish');
  const { thicknessChoices, defaultThickness } = spiralCatalog;
  const note = document.getElementById('spiral-note');
  const reference = document.getElementById('spiral-reference');
  const familyValues = new Map();
  let activeModel;
  let controls = new Map();
  let legacyChoice;
  let legacyThickness;
  let storedParams;
  const choices = new Map();
  const labels = { SP: '직관', EB45: '45° 엘보', EB90: '90° 엘보', CPM: '커플링', TO: '테이크오프' };

  function restoreThickness(model, value = defaultThickness, restoreLegacy = false) {
    const available = model.type === 'oval' ? [...thicknessChoices, 1, ...(model.id === 'OD' ? [] : [1.2])] : thicknessChoices;
    thickness.replaceChildren(...available.map(size => new Option(`${size}T`, size, size === defaultThickness)));
    legacyThickness = undefined;
    if (restoreLegacy && (value === null || (Number.isFinite(value) && value > 0 && !available.includes(value)))) {
      legacyThickness = new Option(value === null ? '제품 표준 (기존 발주)' : `${value}T (기존 발주)`, value ?? '');
      thickness.append(legacyThickness);
    }
    thickness.value = legacyThickness ? legacyThickness.value : String(available.includes(value) ? value : defaultThickness);
  }

  function makeChoice(model, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.dataset.model = model.id;
    button.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 56;
    canvas.setAttribute('aria-hidden', 'true');
    if (Object.hasOwn(spiralProfileFrames, model.shape)) drawSpiralThumbnail(canvas, model.shape);
    else drawPartThumbnail(canvas, model.damper || (model.shape === 'takeoff' ? 'spiralTakeoff' : 'spiral'), Boolean(model.damper));
    button.append(canvas, label);
    choices.set(model.id, button);
    return button;
  }

  for (const model of spiralCatalog.orderModels) {
    const group = model.type === 'oval' ? ovalParts : model.type === 'flex' ? flexParts : model.damper ? dampers : model.branch ? branches
      : Object.hasOwn(spiralHangerProfiles, model.shape) ? hangers : parts;
    group.append(makeChoice(model, model.damper ? model.code : model.choiceLabel ?? labels[model.id] ?? model.name));
  }

  function pickPart(event) {
    const button = event.target.closest('button[data-model]');
    if (!button || button.dataset.model === activeModel.id) return;
    storedParams = undefined;
    const model = spiralCatalog.get(button.dataset.model);
    restoreThickness(model, Number(thickness.value));
    selectModel(model);
    event.currentTarget.dispatchEvent(new Event('input', { bubbles: true }));
  }
  for (const picker of pickers) picker.addEventListener('click', pickPart);

  function readParams() {
    return Object.fromEntries(activeModel.fields.map(field => {
      const value = controls.get(field.key).value;
      const number = field.meters && value ? (Number(value) * 1000).toFixed(6) : value;
      return [field.key, field.key === 'flange' || field.optionLabels ? value : value ? Number(number) : null];
    }));
  }

  function setOptions(field, control, options, params, legacy) {
    const nominal = params[`d${field.ovalDepth}`];
    const signature = `${options.join(',')}|${nominal ?? ''}`;
    if (control.dataset.choices === signature) return;
    const previous = control.value;
    control.dataset.choices = signature;
    control.replaceChildren(new Option(options.length ? '선택' : '호칭 지름 먼저 선택', ''));
    for (const value of options) {
      const label = field.optionLabels?.[value] ?? (field.key === 'flange' ? spiralCatalog.flangeOptions[value]
        : field.key === 'length' ? spiralCatalog.stockLengthText(value) : field.ovalDepth
          ? `D ${format(value)} · W ${format(ovalCatalog.widthFor(nominal, value))}` : `Ø${format(value)}`);
      control.append(new Option(value === legacy ? `${label} (기존 발주)` : label, value, value === field.defaultValue));
    }
    control.value = Array.from(control.options).some(option => option.value === previous) && previous
      ? previous : String(field.defaultValue ?? '');
  }

  function updateOptions() {
    const params = readParams();
    for (const field of activeModel.fields) {
      if (!field.options) continue;
      const standard = spiralCatalog.optionsFor(activeModel, field, params);
      const options = storedParams ? spiralCatalog.optionsFor(activeModel, field, params, storedParams) : standard;
      setOptions(field, controls.get(field.key), options, params, options.length > standard.length ? options.at(-1) : undefined);
    }
  }

  function buildControls(model) {
    activeModel = model;
    controls = new Map();
    const labels = [];
    for (const field of model.fields) {
      const label = document.createElement('label');
      label.textContent = field.label;
      const control = document.createElement(field.options ? 'select' : 'input');
      control.name = `spiral-${field.key}`;
      control.required = true;
      if (!field.options) {
        control.type = 'number';
        control.min = field.meters ? '0.001' : '1';
        control.step = field.meters ? '0.001' : '1';
        control.inputMode = field.meters ? 'decimal' : 'numeric';
      }
      if (field.key === 'runLength') {
        control.placeholder = field.meters ? '예: 12.5' : '예: 9300';
        label.className = 'spiral-run-length';
      }
      controls.set(field.key, control);
      label.append(control);
      labels.push(label);
    }
    box.replaceChildren(...labels);
    updateOptions();
  }

  function selectModel(model) {
    if (legacyChoice && legacyChoice.dataset.model !== model.id) {
      choices.delete(legacyChoice.dataset.model);
      legacyChoice.remove();
      legacyChoice = undefined;
    }
    if (!choices.has(model.id)) {
      legacyChoice = makeChoice(model, `기존 발주 · ${model.name}`);
      parts.append(legacyChoice);
    }
    for (const [id, button] of choices) button.setAttribute('aria-pressed', String(id === model.id));
    buildControls(model);
  }

  function read() {
    if (activeModel.type === 'flex') return { type: 'flex', model: activeModel.id, params: readParams(), material: null, spiralThickness: null };
    return { type: activeModel.type ?? 'spiral', model: activeModel.id, params: readParams(), material: material.value,
      spiralThickness: legacyThickness?.selected && !thickness.value ? null : Number(thickness.value || defaultThickness) };
  }

  function sync(type) {
    const enabled = orderCalculations.isCatalogItem(type);
    section.hidden = !enabled;
    section.disabled = !enabled;
    if (!enabled) return;
    const activeType = activeModel.type ?? 'spiral';
    if (activeType !== type) {
      familyValues.set(activeType, read());
      restore(familyValues.get(type), type);
    }
    const model = activeModel;
    document.getElementById('catalog-legend').textContent = { spiral: '스파이럴 규격', oval: '오발 규격', flex: '플렉시블 규격' }[type];
    finish.hidden = material.disabled = thickness.disabled = type === 'flex';
    updateOptions();
    const item = read();
    const details = spiralCatalog.details(item, format).slice(1);
    if (model.checkCombination) details.push('지름 조합은 공급처에 확인하세요.');
    if (model.shape.startsWith('elbow') || model.shape === 'twin' && model.page === 5) details.push('제조사 표에 반경 R 수치가 없습니다.');
    if (type === 'flex') details.push('10M = 1박스. 남는 길이가 있으면 한 박스를 추가합니다.');
    else if (spiralCatalog.isStock(model.id)) details.push('전체 길이에 맞춰 정척으로 나누고, 남는 치수는 정척 한 본을 추가합니다.');
    if (model.fixedLength) details.push(`제작 길이 L ${format(model.fixedLength)} mm (고정)`);
    note.textContent = details.join(' · ');
    note.hidden = !details.length;
    reference.hidden = !model.page;
    if (model.page) reference.href = `https://www.dsduct.co.kr/kr/p-${type === 'spiral' ? `1-${model.page}` : model.page}.html`;
  }

  function restore(values, type) {
    const picked = spiralCatalog.get(values?.model);
    const model = picked && (picked.type ?? 'spiral') === type ? picked : spiralCatalog.get({ spiral: 'SP', oval: 'OD', flex: 'flex-al' }[type]);
    storedParams = values?.params;
    material.value = values?.material || 'galvanized';
    restoreThickness(model, type === 'flex' ? undefined : values?.spiralThickness, true);
    selectModel(model);
    for (const { key, meters } of model.fields) {
      const value = storedParams?.[key];
      if (value == null) continue;
      controls.get(key).value = meters ? value / 1000 : value;
      if (/^d[1-4]$/.test(key)) updateOptions();
    }
    if (model.id === 'SP' && values?.params?.d1 && values.params.runLength === undefined) {
      controls.get('runLength').value = values.params.length ?? '';
    }
  }

  function reset(values, type) {
    familyValues.clear();
    restore(values, orderCalculations.isCatalogItem(type) ? type : 'spiral');
  }

  return { read, sync, reset };
}

const spiralHangerProfiles = {
  hangerRound: { gap: 0.16, tabX: 0, tabY: -19 },
  hangerU: { gap: Math.PI / 2, tabX: 0, tabY: -31 },
  hangerHalf: { gap: Math.PI / 2, tabX: 14, tabY: 0 },
  hangerShort: { gap: 0.16, tabX: 0, tabY: -7 },
};

const spiralProfileFrames = {
  duct: [15, 37, 210, 49],
  ovalDuct: [23, 34, 195, 59],
  ovalOffset: [32, 27, 175, 69],
  ovalBend: [61, 22, 113, 82],
  flexDuct: [34, 23, 174, 90],
  flexInsulated: [34, 23, 174, 90],
  coupling: [72, 35, 96, 53],
  cap: [77, 21, 86, 85],
  capGasket: [77, 21, 86, 85],
  elbow90: [67, 8, 104, 105],
  elbow45: [67, 20, 74, 93],
  conicalTee: [30, 35, 180, 75],
  combinationTee: [30, 35, 180, 75],
  reducingTee: [30, 35, 180, 75],
  yBranch: [30, 35, 180, 84],
  ytBranch: [30, 35, 180, 83],
  saddle: [57, 20, 126, 87],
  roundReducer: [35, 30, 170, 64],
  hangerRound: [78, 10, 84, 103],
  hangerU: [78, 38, 84, 75],
  hangerHalf: [65, 66, 110, 47],
  hangerShort: [78, 22, 84, 91],
};

const spiralBranchProfiles = {
  conicalTee: { outlet: [[94, 64], [145, 64], [133, 86], [133, 104], [106, 104], [106, 86]], collar: [[106, 97], [133, 97]] },
  combinationTee: { outlet: [[90, 65], [145, 65], [142, 87], [142, 104], [114, 104], [114, 89]], collar: [[114, 97], [142, 97]] },
  reducingTee: { outlet: [[94, 68], [133, 68], [133, 104], [94, 104]], collar: [[94, 97], [133, 97]] },
  yBranch: { outlet: [[98, 70], [133, 65], [168, 99], [149, 115]], collar: [[144, 109], [162, 94]] },
  ytBranch: { outlet: [[90, 69], [127, 66], [151, 87], [156, 102], [156, 114], [129, 114], [129, 103], [121, 94]], collar: [[129, 107], [156, 107]] },
};

function drawSpiralThumbnail(canvas, shape) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const [left, top, width, height] = spiralProfileFrames[shape];
  const scale = Math.min(106 / width, 50 / height);
  context.setTransform(scale, 0, 0, scale, (canvas.width - width * scale) / 2 - left * scale,
    (canvas.height - height * scale) / 2 - top * scale);
  drawSpiralProfile(context, shape);
}

function drawSpiralProfile(context, shape) {
  const edge = '#345448';
  const seam = '#527266';
  context.lineJoin = 'round';
  context.lineCap = 'round';

  function box(x, y, width, height, fill) {
    context.fillStyle = fill;
    context.fillRect(x, y, width, height);
    context.strokeStyle = edge;
    context.lineWidth = 1.6;
    context.strokeRect(x, y, width, height);
  }

  function line(points, color = seam, width = 1.15) {
    context.beginPath();
    for (const [x, y] of points) context.lineTo(x, y);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  }

  function cylinderFill(top, bottom) {
    const fill = context.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, '#b5c8bf');
    fill.addColorStop(0.36, '#f1f6f2');
    fill.addColorStop(0.73, '#d3e1d8');
    fill.addColorStop(1, '#a4bbb0');
    return fill;
  }

  function polygon(points, fill) {
    context.beginPath();
    for (const [x, y] of points) context.lineTo(x, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.75;
    context.stroke();
  }

  if (shape === 'ovalDuct') {
    context.beginPath();
    context.roundRect(23, 35, 193, 52, 12);
    context.fillStyle = cylinderFill(35, 87);
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.75;
    context.stroke();
    for (const x of [39, 79, 119, 159]) line([[x, 35], [x + 29, 87]]);
    context.beginPath();
    context.roundRect(23, 48, 33, 27, 13.5);
    context.fillStyle = '#789487';
    context.fill();
    context.stroke();
    return;
  }

  if (shape === 'ovalOffset') {
    polygon([[35, 27], [81, 27], [158, 59], [205, 59], [205, 94], [153, 94], [76, 62], [35, 62]], cylinderFill(27, 94));
    line([[45, 27], [45, 62]]);
    line([[195, 59], [195, 94]]);
    return;
  }

  if (shape === 'ovalBend') {
    polygon([[63, 99], [63, 25], [169, 25], [169, 61], [109, 61], [109, 99]], cylinderFill(25, 99));
    line([[63, 25], [109, 61]]);
    line([[63, 89], [109, 89]]);
    line([[159, 25], [159, 61]]);
    return;
  }

  if (shape === 'flexDuct' || shape === 'flexInsulated') {
    const insulated = shape === 'flexInsulated';
    context.beginPath();
    context.moveTo(56, 47);
    context.bezierCurveTo(102, 44, 137, 14, 181, 24);
    context.bezierCurveTo(216, 31, 214, 76, 180, 79);
    context.bezierCurveTo(142, 71, 105, 102, 56, 106);
    context.closePath();
    context.fillStyle = cylinderFill(29, 106);
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.8;
    context.stroke();
    context.save();
    context.clip();
    for (let x = 64; x < 200; x += insulated ? 21 : 10) {
      context.beginPath();
      context.moveTo(x, 22);
      context.quadraticCurveTo(x + 28, 66, x + 8, 105);
      context.strokeStyle = seam;
      context.lineWidth = insulated ? 0.85 : 1.3;
      context.stroke();
    }
    context.restore();
    context.beginPath();
    context.ellipse(56, 76.5, 20, 29.5, 0, 0, Math.PI * 2);
    context.fillStyle = '#517065';
    context.fill();
    context.strokeStyle = insulated ? '#d1b26f' : edge;
    context.lineWidth = insulated ? 5 : 2;
    context.stroke();
    return;
  }

  if (shape === 'cap' || shape === 'capGasket') {
    context.beginPath();
    context.moveTo(103, 27);
    context.lineTo(136, 27);
    context.bezierCurveTo(166, 27, 166, 101, 136, 101);
    context.lineTo(103, 101);
    context.closePath();
    context.fillStyle = cylinderFill(27, 101);
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.75;
    context.stroke();
    if (shape === 'capGasket') {
      context.beginPath();
      context.moveTo(132, 26);
      context.bezierCurveTo(159, 26, 159, 102, 132, 102);
      context.lineWidth = 3.2;
      context.stroke();
    }
    context.beginPath();
    context.ellipse(103, 64, 24, 37, 0, 0, Math.PI * 2);
    context.fillStyle = '#6e897e';
    context.fill();
    context.lineWidth = 1.75;
    context.stroke();
    return;
  }

  if (shape === 'saddle') {
    context.beginPath();
    context.moveTo(58, 72);
    context.quadraticCurveTo(120, 54, 182, 72);
    context.quadraticCurveTo(120, 139, 58, 72);
    context.closePath();
    context.fillStyle = cylinderFill(63, 107);
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.75;
    context.stroke();

    context.beginPath();
    context.moveTo(80, 29);
    context.lineTo(80, 74);
    context.quadraticCurveTo(120, 109, 160, 74);
    context.lineTo(160, 29);
    context.closePath();
    context.fillStyle = cylinderFill(29, 94);
    context.fill();
    context.stroke();

    context.beginPath();
    context.ellipse(120, 29, 40, 9, 0, 0, Math.PI * 2);
    context.fillStyle = '#567368';
    context.fill();
    context.stroke();
    return;
  }

  const branch = spiralBranchProfiles[shape];
  if (branch) {
    polygon(branch.outlet, cylinderFill(66, 115));
    line(branch.collar);
    if (shape === 'reducingTee') {
      polygon([[33, 39], [145, 39], [169, 47], [207, 47], [207, 71], [169, 71], [145, 79], [33, 79]],
        cylinderFill(39, 79));
      line([[169, 47], [169, 71]]);
      line([[198, 47], [198, 71]]);
    } else {
      box(33, 39, 174, 40, cylinderFill(39, 79));
      line([[198, 39], [198, 79]]);
    }
    line([[42, 39], [42, 79]]);
    return;
  }

  const hanger = spiralHangerProfiles[shape];
  if (hanger) {
    const start = -Math.PI / 2 + hanger.gap;
    const end = 3 * Math.PI / 2 - hanger.gap;
    const [x, y, radius] = [120, 70, 39];
    const startX = x + radius * Math.cos(start);
    const endX = x + radius * Math.cos(end);
    const tabY = y + radius * Math.sin(start);
    const drawBand = (color, width) => {
      context.beginPath();
      context.moveTo(startX + hanger.tabX, tabY + hanger.tabY);
      context.lineTo(startX, tabY);
      context.arc(x, y, radius, start, end);
      context.lineTo(endX - hanger.tabX, tabY + hanger.tabY);
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
    };
    drawBand(edge, 5.5);
    drawBand('#dbe9df', 2.5);
    return;
  }

  if (shape === 'roundReducer') {
    polygon([[39, 35], [92, 35], [150, 47], [201, 47], [201, 74], [150, 74], [92, 86], [39, 86]], cylinderFill(35, 86));
    line([[47, 35], [47, 86]]);
    line([[92, 35], [92, 86]]);
    line([[150, 47], [150, 74]]);
    line([[193, 47], [193, 74]]);
    return;
  }

  if (shape === 'duct') {
    box(18, 41, 204, 41, cylinderFill(41, 82));
    context.save();
    context.beginPath();
    context.rect(19, 41, 202, 41);
    context.clip();
    for (const x of [23, 72, 121, 170, 219]) {
      line([[x, 39], [x + 25, 84]], seam, 3.4);
      line([[x + 2, 39], [x + 27, 84]], '#e7f1ea', 1.15);
    }
    context.restore();
    line([[21, 42], [21, 81]], '#5c776c');
    line([[219, 42], [219, 81]], '#5c776c');
    return;
  }

  if (shape === 'coupling') {
    box(75, 43, 37, 37, cylinderFill(43, 80));
    box(128, 43, 37, 37, cylinderFill(43, 80));
    box(112, 38, 16, 47, cylinderFill(38, 85));
    line([[118, 39], [118, 84]], '#f0f5f1', 1.5);
    line([[79, 43], [79, 80]]);
    line([[161, 43], [161, 80]]);
    return;
  }

  const turn = shape === 'elbow90' ? 90 : 45;
  const divisions = turn === 90 ? 4 : 3;
  const inner = 40;
  const outer = 81;
  const center = [152, 93];
  const angles = Array.from({ length: divisions + 1 }, (_, index) => Math.PI + index * turn * Math.PI / (180 * divisions));
  const point = (radius, angle) => [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
  const fill = context.createRadialGradient(...center, inner, ...center, outer);
  fill.addColorStop(0, '#a8bfb3');
  fill.addColorStop(0.56, '#edf4ee');
  fill.addColorStop(1, '#b4c8bd');

  polygon([...angles.map(angle => point(outer, angle)), ...angles.slice().reverse().map(angle => point(inner, angle))], fill);
  for (const angle of angles.slice(1, -1)) {
    line([point(inner, angle), point(outer, angle)]);
    line([point(inner + 1, angle + 0.024), point(outer - 1, angle + 0.024)], '#f1f7f2');
  }
  for (const [angle, direction] of [[angles[0], -1], [angles.at(-1), 1]]) {
    const extension = (radius, length) => {
      const [x, y] = point(radius, angle);
      return [x - direction * length * Math.sin(angle), y + direction * length * Math.cos(angle)];
    };
    polygon([extension(outer, 0), extension(outer, 15), extension(inner, 15), extension(inner, 0)], fill);
    line([extension(outer, 5), extension(inner, 5)]);
  }
}

function drawSpiralDiagram(canvas, model, params) {
  const { format, positiveInteger } = orderCalculations;
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.height = 272;
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.clearRect(0, 0, 400, 136);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  const shape = model.shape;
  const size = (symbol, value) => positiveInteger(value) ? `${symbol}${format(value)}` : symbol;
  const diameter = (key, fallback = `Ø${key}`) => positiveInteger(params[key]) ? size('Ø', params[key]) : fallback;

  function outline(points, close = false) {
    context.beginPath();
    points.forEach(([x, y]) => context.lineTo(x, y));
    if (close) {
      context.closePath();
      context.fillStyle = '#dcece3';
      context.fill();
    }
    context.lineWidth = close ? 1.8 : 1;
    context.strokeStyle = close ? '#233f35' : '#497467';
    context.stroke();
  }

  function label(text, x, y) {
    context.fillStyle = '#17614c';
    context.font = '700 13px "Malgun Gothic", sans-serif';
    context.textAlign = 'center';
    context.fillText(text, x, y, 2 * Math.min(x - 6, 394 - x));
  }

  if (model.damper) {
    context.save();
    context.translate(96, 3);
    drawDamperBody(context, model.damper, true);
    context.restore();
    label(diameter('d1', 'Ø'), 75, 84);
    outline([[132, 109], [267, 109]]);
    outline([[132, 105], [132, 113]]);
    outline([[267, 105], [267, 113]]);
    label(size('L ', model.fixedLength), 200, 128);
    return;
  }

  if (model.type === 'oval') {
    const [left, top, width, height] = spiralProfileFrames[shape];
    const scale = Math.min(146 / width, 94 / height);
    context.save();
    context.translate(98 - (left + width / 2) * scale, 64 - (top + height / 2) * scale);
    context.scale(scale, scale);
    drawSpiralProfile(context, shape);
    context.restore();
    const ends = model.fields.filter(field => field.diameter);
    for (const [index, field] of ends.entries()) {
      const y = (136 / ends.length) * (index + 0.5) - 4;
      const oval = field.ovalEnd;
      const depth = params[`depth${oval}`];
      const width = ovalCatalog.widthFor(params[field.key], depth);
      const vertical = params.orientation === 'V';
      const [w, h] = oval ? vertical ? [12, 34] : [40, 13] : [23, 23];
      context.beginPath();
      context.roundRect(207 - w / 2, y - h / 2, w, h, Math.min(w, h) / 2);
      context.fillStyle = '#dcece3';
      context.fill();
      context.strokeStyle = '#233f35';
      context.lineWidth = 1.5;
      context.stroke();
      const name = field.label.split(' ')[0];
      const nominal = diameter(field.key);
      const dimensions = oval ? ` · ${size('D', depth)} × ${size('W', width)}` : '';
      label(`${name} ${nominal}${dimensions}`, 310, y + 4);
    }
    if (model.id === 'OD') label(spiralCatalog.stockLengthText(params.length), 98, 124);
    else if (params.orientation) label(`${params.orientation}형`, 98, 124);
    return;
  }

  if (model.type === 'flex') {
    context.save();
    context.translate(80, 4);
    drawSpiralProfile(context, shape);
    context.restore();
    label(diameter('d1', 'Ø'), 104, 82);
    label('10M / 1박스', 201, 128);
    return;
  }

  if (Object.hasOwn(spiralProfileFrames, shape)) {
    context.save();
    context.translate(shape === 'elbow45' ? 101 : 80, 2);
    drawSpiralProfile(context, shape);
    context.restore();
    if (shape === 'duct') {
      outline([[98, 91], [98, 111], [302, 111], [302, 91]]);
      outline([[310, 43], [320, 43], [320, 84], [310, 84]]);
      label(spiralCatalog.stockLengthText(params.length), 200, 128);
      label(diameter('d1', 'Ø'), 351, 67);
    } else if (shape === 'coupling') {
      outline([[249, 45], [259, 45], [259, 82], [249, 82]]);
      label(diameter('d1', 'Ø'), 292, 67);
    } else if (shape === 'cap' || shape === 'capGasket') {
      outline([[152, 29], [142, 29], [142, 103], [152, 103]]);
      label(diameter('d1', 'Ø'), 109, 70);
    } else if (shape === 'saddle') {
      outline([[243, 38], [271, 38]]);
      outline([[139, 77], [104, 88]]);
      label(diameter('d3'), 303, 42);
      label(diameter('d1', 'Ød'), 75, 93);
    } else if (Object.hasOwn(spiralHangerProfiles, shape)) {
      const dimY = shape === 'hangerU' || shape === 'hangerHalf' ? 72 : 68;
      outline([[163, dimY], [237, dimY]]);
      outline([[168, dimY - 3], [163, dimY], [168, dimY + 3]]);
      outline([[232, dimY - 3], [237, dimY], [232, dimY + 3]]);
      label(diameter('d1', 'Ø'), 200, dimY + 18);
    } else if (model.branch) {
      const endY = shape === 'roundReducer' ? 66 : 64;
      label(diameter('d1'), 75, endY);
      label(diameter('d2'), 325, endY);
      if (spiralBranchProfiles[shape]) label(diameter('d3'), shape === 'yBranch' ? 250 : shape === 'ytBranch' ? 225 : 203, 130);
    } else {
      const rightAngle = shape === 'elbow90';
      const angle = rightAngle ? 90 : 45;
      label(`${angle}°`, rightAngle ? 126 : 145, 44);
      label(diameter('d1'), rightAngle ? 172 : 193, 129);
      label(model.fields.some(field => field.key === 'd2') ? diameter('d2') : diameter('d1', 'Ød2'), rightAngle ? 284 : 265, 41);
      const length = model.elbowLength?.[params.d1];
      if (length) label(size('L ', length), 276, 101);
    }
    return;
  }

  if (['tee', 'wye', 'cross', 'crossY', 'twin'].includes(shape)) {
    if (shape === 'twin') {
      outline([[87, 51], [170, 51], [254, 19], [312, 19], [312, 45], [267, 45], [206, 68], [267, 92],
        [312, 92], [312, 118], [254, 118], [170, 85], [87, 85]], true);
      label(diameter('d1'), 61, 72);
      label(diameter('d3'), 337, 35);
      label(diameter('d4'), 337, 109);
      return;
    }
    const slanted = shape === 'wye' || shape === 'crossY';
    const upper = slanted ? 228 : 178;
    const lower = slanted ? 228 : 178;
    const both = shape === 'cross' || shape === 'crossY';
    const roof = [[88, 52], [178, 52], [upper, 16], [upper + 35, 16], [213, 52], [312, 52], [312, 84]];
    if (both) roof.push([213, 84], [lower + 35, 118], [lower, 118], [178, 84]);
    roof.push([88, 84]);
    outline(roof, true);
    label(diameter('d1'), 60, 72);
    label(diameter('d2'), 340, 72);
    label(diameter('d3'), upper + 61, 27);
    if (both) label(diameter('d4'), lower + 61, 121);
    return;
  }

  const profiles = {
    reducer: [[92, 43], [309, 57], [309, 82], [92, 94]],
    transition: [[92, 42], [303, 56], [303, 83], [92, 94]],
    hood: [[109, 54], [200, 26], [291, 54], [226, 54], [226, 92], [174, 92], [174, 54]],
    flat: [[84, 81], [167, 81], [167, 30], [218, 30], [218, 81], [316, 81], [316, 105], [84, 105]],
    takeoff: [[144, 99], [164, 86], [164, 38], [236, 38], [236, 86], [256, 99]],
  };
  if (shape === 'band') {
    context.beginPath();
    context.arc(200, 67, 37, 0, 2 * Math.PI);
    context.strokeStyle = '#233f35';
    context.lineWidth = 4;
    context.stroke();
    outline([[173, 67], [227, 67]]);
    label(diameter('d1', 'Ø'), 200, 60);
    return;
  }
  outline(profiles[shape] || profiles.cap, true);
  if (shape === 'reducer' || shape === 'transition') {
    const inlet = shape === 'reducer' ? diameter('d1') : `${positiveInteger(params.l1) ? format(params.l1) : 'l1'} × ${positiveInteger(params.l2) ? format(params.l2) : 'l2'}`;
    label(inlet, 46, 72);
    label(shape === 'reducer' ? diameter('d2') : diameter('d1'), 351, 72);
  } else if (shape === 'flat') {
    label(diameter('d1', 'ØD'), 193, 23);
    label(size('L ', params.length), 200, 125);
    label(size('H ', params.height), 352, 99);
  } else {
    label(diameter('d1', 'Ø'), 200, 123);
  }
}
