'use strict';

function mountSpiralEntry() {
  const { format } = orderCalculations;
  const section = document.getElementById('spiral-fields');
  const picker = document.getElementById('spiral-part-picker');
  const parts = document.getElementById('spiral-parts');
  const dampers = document.getElementById('spiral-dampers');
  const box = document.getElementById('spiral-dimensions');
  const material = document.getElementById('spiral-material');
  const thickness = document.getElementById('spiral-thickness');
  const note = document.getElementById('spiral-note');
  const reference = document.getElementById('spiral-reference');
  let activeModel;
  let controls = new Map();
  let legacyChoice;
  const choices = new Map();
  const labels = { SP: '직관', EB45: '45° 엘보', EB90: '90° 엘보', CPM: '커플링', TO: '테이크오프' };

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
    const group = model.damper ? dampers : parts;
    group.append(makeChoice(model, model.damper ? model.code : labels[model.id]));
  }

  picker.addEventListener('click', event => {
    const button = event.target.closest('button[data-model]');
    if (!button || button.dataset.model === activeModel.id) return;
    selectModel(spiralCatalog.get(button.dataset.model));
    picker.dispatchEvent(new Event('input', { bubbles: true }));
  });

  function readParams() {
    return Object.fromEntries([...controls].map(([key, control]) => {
      const value = control.value;
      return [key, key === 'flange' ? value : value ? Number(value) : null];
    }));
  }

  function setOptions(field, control, options) {
    const signature = options.join(',');
    if (control.dataset.choices === signature) return;
    const previous = control.value;
    control.dataset.choices = signature;
    control.replaceChildren(new Option(options.length ? '선택' : '앞 지름 먼저 선택', ''));
    for (const value of options) {
      const label = field.key === 'flange' ? spiralCatalog.flangeOptions[value]
        : field.key === 'length' ? `${format(value)} mm` : `Ø${format(value)}`;
      control.append(new Option(label, value, value === field.defaultValue));
    }
    control.value = Array.from(control.options).some(option => option.value === previous) && previous
      ? previous : String(field.defaultValue ?? '');
  }

  function updateOptions() {
    const params = readParams();
    for (const field of activeModel.fields) {
      if (field.options) setOptions(field, controls.get(field.key), spiralCatalog.optionsFor(activeModel, field, params));
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
        control.min = '1';
        control.step = '1';
        control.inputMode = 'numeric';
      }
      if (field.key === 'runLength') {
        control.placeholder = '예: 9300';
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
    return { type: 'spiral', model: activeModel.id, params: readParams(), material: material.value,
      spiralThickness: thickness.value ? Number(thickness.value) : null };
  }

  function sync(enabled) {
    section.hidden = !enabled;
    section.disabled = !enabled;
    thickness.setCustomValidity('');
    if (!enabled) return;
    const model = activeModel;
    updateOptions();
    const item = read();
    const details = spiralCatalog.details(item, format).slice(1);
    if (model.checkCombination) details.push('지름 조합은 공급처에 확인하세요.');
    if (model.shape.startsWith('elbow') || model.shape === 'twin' && model.page === 5) details.push('제조사 표에 반경 R 수치가 없습니다.');
    if (model.code === 'SP') details.push('전체 길이에 맞춰 정척으로 나누고, 남는 치수는 정척 한 본을 추가합니다.');
    if (model.fixedLength) details.push(`제작 길이 L ${format(model.fixedLength)} mm (고정)`);
    const band = spiralCatalog.thicknessBand(item);
    if (band) {
      const sizes = band.choices ? band.choices.join(' / ') : `${band.min}–${band.max}`;
      details.push(`이 지름의 표기 판두께 ${sizes} T`);
      if (!spiralCatalog.validThickness(item)) thickness.setCustomValidity(`이 지름의 판두께는 ${sizes} T 범위에서 지정하세요.`);
    }
    note.textContent = details.join(' · ');
    note.hidden = !details.length;
    reference.hidden = !model.page;
    if (model.page) reference.href = `https://dsduct.co.kr/kr/p-1-${model.page}.html`;
  }

  function restore(values) {
    const model = spiralCatalog.get(values?.model) || spiralCatalog.get('SP');
    material.value = values?.material || 'galvanized';
    thickness.value = values?.spiralThickness ?? '';
    selectModel(model);
    for (const [key, value] of Object.entries(values?.params || {})) {
      if (!controls.has(key) || value === null) continue;
      controls.get(key).value = value;
      if (key === 'd1') updateOptions();
    }
    if (model.id === 'SP' && values?.params?.d1 && values.params.runLength === undefined) {
      controls.get('runLength').value = values.params.length ?? '';
    }
  }

  return { read, sync, restore };
}

const spiralProfileFrames = {
  duct: [15, 37, 210, 49],
  coupling: [72, 35, 96, 53],
  elbow90: [67, 8, 104, 105],
  elbow45: [67, 20, 74, 93],
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

  function polygon(points) {
    context.beginPath();
    for (const [x, y] of points) context.lineTo(x, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.75;
    context.stroke();
  }

  polygon([...angles.map(angle => point(outer, angle)), ...angles.slice().reverse().map(angle => point(inner, angle))]);
  for (const angle of angles.slice(1, -1)) {
    line([point(inner, angle), point(outer, angle)]);
    line([point(inner + 1, angle + 0.024), point(outer - 1, angle + 0.024)], '#f1f7f2');
  }
  for (const [angle, direction] of [[angles[0], -1], [angles.at(-1), 1]]) {
    const extension = (radius, length) => {
      const [x, y] = point(radius, angle);
      return [x - direction * length * Math.sin(angle), y + direction * length * Math.cos(angle)];
    };
    polygon([extension(outer, 0), extension(outer, 15), extension(inner, 15), extension(inner, 0)]);
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

  if (Object.hasOwn(spiralProfileFrames, shape)) {
    context.save();
    context.translate(shape === 'elbow45' ? 101 : 80, 2);
    drawSpiralProfile(context, shape);
    context.restore();
    if (shape === 'duct') {
      outline([[98, 91], [98, 111], [302, 111], [302, 91]]);
      outline([[310, 43], [320, 43], [320, 84], [310, 84]]);
      label(size('L ', params.length), 200, 128);
      label(diameter('d1', 'Ø'), 351, 67);
    } else if (shape === 'coupling') {
      outline([[249, 45], [259, 45], [259, 82], [249, 82]]);
      label(diameter('d1', 'Ø'), 292, 67);
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

  if (['tee', 'wye', 'cross', 'crossY', 'twin', 'saddle'].includes(shape)) {
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
    label(diameter('d1', shape === 'saddle' ? 'Ød' : 'Ød1'), 60, 72);
    if (shape !== 'saddle') label(diameter('d2'), 340, 72);
    label(diameter('d3'), upper + 61, 27);
    if (both) label(diameter('d4'), lower + 61, 121);
    return;
  }

  const profiles = {
    reducer: [[92, 43], [309, 57], [309, 82], [92, 94]],
    transition: [[92, 42], [303, 56], [303, 83], [92, 94]],
    cap: [[156, 42], [227, 42], [241, 54], [241, 82], [227, 94], [156, 94]],
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
