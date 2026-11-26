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
  const icons = { duct: 'spiral', elbow45: 'elbow45', elbow90: 'elbow', coupling: 'spiralCoupling', takeoff: 'spiralTakeoff' };

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
    drawPartThumbnail(canvas, model.damper || icons[model.shape] || 'spiral', Boolean(model.damper));
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
    if (model.code === 'SP') details.push('제조사 표준 4 m · 기존 발주 규격 2 m 선택 가능');
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
  }

  return { read, sync, restore };
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

  if (shape === 'elbow90' || shape === 'elbow45') {
    const angle = shape === 'elbow90' ? 90 : 45;
    const terminal = Math.PI + angle * Math.PI / 180;
    context.beginPath();
    context.arc(218, 108, 83, Math.PI, terminal);
    context.arc(218, 108, 35, terminal, Math.PI, true);
    context.closePath();
    context.fillStyle = '#dcece3';
    context.fill();
    context.strokeStyle = '#233f35';
    context.lineWidth = 1.8;
    context.stroke();
    label(`${angle}°`, 110, 69);
    label(diameter('d1'), 158, 126);
    label(model.fields.some(field => field.key === 'd2') ? diameter('d2') : diameter('d1', 'Ød2'), 249, 40);
    const length = model.elbowLength?.[params.d1];
    if (length) label(size('L ', length), 276, 101);
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
    duct: [[86, 48], [314, 48], [314, 88], [86, 88]],
    coupling: [[138, 48], [262, 48], [262, 88], [138, 88]],
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
  outline(profiles[shape] || profiles.coupling, true);
  if (shape === 'duct') {
    for (let x = 102; x < 270; x += 30) outline([[x, 88], [x + 37, 48]]);
    outline([[86, 110], [314, 110]]);
    label(size('L ', params.length), 200, 126);
    label(diameter('d1', 'Ø'), 350, 72);
  } else if (shape === 'reducer' || shape === 'transition') {
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
