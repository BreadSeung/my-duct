'use strict';

const spiralCatalog = (() => {
  const ductDiameters = [75, 80, 95, 100, 125, 150, 155, 160, 175, 180, 200, 225, 230, 250, 275, 280, 300,
    325, 330, 350, 375, 380, 400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700, 725, 750, 800,
    850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100,
    2200, 2300, 2400, 2500];
  // Model-specific tables take precedence over the manufacturer's general fitting diameters.
  const fittingDiameters = [75, 80, 100, 125, 150, 160, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425,
    450, 475, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300,
    1350, 1400, 1450, 1500];
  const pressedElbows = [75, 80, 100, 125, 150, 160, 175, 180, 200, 250, 300];
  const standardFittingDiameters = [75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500];
  const pressedCaps = [100, 125, 150, 200, 250, 300];
  const thicknessChoices = Object.freeze([0.5, 0.6, 0.8]);
  const defaultThickness = 0.6;
  const elbow90 = { 200: 200, 250: 250, 300: 300, 400: 400, 450: 450, 500: 500, 600: 600, 800: 800,
    900: 900, 1000: 1000, 1250: 1250 };
  const elbow45 = { 200: 83, 250: 104, 300: 124, 400: 162, 450: 186, 500: 204, 600: 249, 800: 331,
    900: 373, 1000: 414, 1250: 518 };
  const press90G = { 75: 90, 80: 100, 100: 100, 125: 125, 150: 150, 160: 160, 180: 175, 200: 200, 250: 250, 300: 300 };
  const press45G = { 80: 41, 100: 41, 125: 52, 150: 62, 160: 66, 180: 75, 200: 83, 250: 104, 300: 124 };
  const saddlePairs = { 125: [100], 150: [100, 125], 200: [100, 125, 150], 250: [100, 125, 150, 200],
    300: [100, 125, 150, 200], 350: [100, 125, 150], 400: [150] };
  const pressedReducerPairs = { 75: [50], 100: [50, 65, 75, 80], 125: [100], 150: [100, 125], 200: [150], 250: [150] };
  const keysAsNumbers = table => Object.keys(table).map(Number);
  const flangeOptions = { folded: '꺾음 20–30 mm', dropped: '밑으로 내림', welded: '밑으로 내림 + 모서리 용접' };
  const diam = (key, label = `지름 Ø${key}`, options = fittingDiameters) => ({ key, label, options, diameter: true });
  const measure = (key, label) => ({ key, label });
  const one = [diam('d1', '접속 지름 Ø')];
  const ends = [diam('d1', '입구 지름 Ød1'), diam('d2', '출구 지름 Ød2')];
  const reducedEnds = [diam('d1', '큰 쪽 지름 Ød1', fittingDiameters.slice(1)), diam('d2', '작은 쪽 지름 Ød2')];
  const tee = [diam('d1', '본관 시작 Ød1'), diam('d2', '본관 끝 Ød2'), diam('d3', '분기 Ød3')];
  const cross = [...tee, diam('d4', '반대 분기 Ød4')];
  const twin = [diam('d1', '공통 지름 Ød1'), diam('d3', '분기 Ød3'), diam('d4', '분기 Ød4')];
  const pressed = [diam('d1', '접속 지름 Ød1 = Ød2', standardFittingDiameters)];
  const transition = [measure('l1', '사각 가로 l1'), measure('l2', '사각 세로 l2'), diam('d1', '원형 지름 Ød1')];
  const diameterPair = table => [diam('d1', '큰 쪽 지름 Ød1', keysAsNumbers(table)), diam('d2', '작은 쪽 지름 Ød2', [])];
  const model = (code, name, shape, fields = one, extra = {}) => ({ code, id: code, name, shape, fields, ...extra });
  const pair = (code, name, shape, fields, extra = {}, gasketCode = `${code}G`) => [
    model(code, name, shape, fields, extra),
    model(gasketCode, `${name} · 가스켓`, shape, fields, { ...extra, id: gasketCode === code ? `${code}:gasket` : gasketCode }),
  ];
  const groups = [
    { name: '스파이럴 직관', page: 1, models: [model('SP', '스파이럴 직관', 'duct', [diam('d1', '직관 지름 Ø', ductDiameters),
      { key: 'length', label: '정척 (한 본 길이)', options: [4000, 2000], defaultValue: 4000 },
      measure('runLength', '한 구간 전체 길이 L')])] },
    { name: '엘보', page: 5, models: [
      ...pair('EB90', '90° 엘보', 'elbow90', pressed, { legacyDiameters: pressedElbows }),
      ...pair('EB45', '45° 엘보', 'elbow45', pressed, { legacyDiameters: pressedElbows }),
      ...pair('EBS90', '90° 편 엘보', 'elbow90', [diam('d1', '기준 지름 Ød1', keysAsNumbers(elbow90)), ends[1]], { elbowLength: elbow90, checkCombination: true }),
      ...pair('EBS45', '45° 편 엘보', 'elbow45', [diam('d1', '기준 지름 Ød1', keysAsNumbers(elbow45)), ends[1]], { elbowLength: elbow45, checkCombination: true }),
      ...pair('TWEB90', '90° 트윈엘보', 'twin', twin, { checkCombination: true }),
    ] },
    { name: 'T 브랜치', page: 6, models: [
      ...pair('T', '정티', 'tee', tee, { checkCombination: true }),
      ...pair('CNT', '원뿔 티', 'conicalTee', tee, { branch: true, checkCombination: true }),
      ...pair('CMT', '편심 티', 'combinationTee', tee, { branch: true, checkCombination: true }),
      ...pair('CRT', '크로스 티', 'cross', cross, { checkCombination: true }),
      ...pair('RT', '리듀싱 티', 'reducingTee', tee, { branch: true, checkCombination: true }),
      ...pair('RCNT', '리듀싱 원뿔 티', 'tee', tee, { checkCombination: true }),
      ...pair('RCMT', '리듀싱 편심 티', 'tee', tee, { checkCombination: true }),
      ...pair('RCRT', '리듀싱 크로스 티', 'cross', cross, { checkCombination: true }),
      ...pair('CAPT', '캡 티', 'tee', tee, { checkCombination: true }, 'CAPT'),
    ] },
    { name: 'Y · YT 브랜치 / 바지관 / 새들', page: 6, models: [
      ...pair('YB', 'Y 브랜치', 'yBranch', tee, { branch: true, checkCombination: true }),
      ...pair('RYB', '리듀싱 Y 브랜치', 'wye', tee, { checkCombination: true }),
      ...pair('CRYB', '크로스 Y 브랜치', 'crossY', cross, { checkCombination: true }),
      ...pair('RCRYB', '리듀싱 크로스 Y 브랜치', 'crossY', cross, { checkCombination: true }),
      ...pair('YTB', 'YT 브랜치', 'ytBranch', tee, { branch: true, checkCombination: true }),
      ...pair('RYTB', '리듀싱 YT 브랜치', 'wye', tee, { checkCombination: true }),
      ...pair('CRYTB', '크로스 YT 브랜치', 'crossY', cross, { checkCombination: true }),
      ...pair('RCRYTB', '리듀싱 크로스 YT 브랜치', 'crossY', cross, { checkCombination: true }),
      ...pair('TWB', '바지관', 'twin', twin, { checkCombination: true }),
      ...pair('SD', '새들', 'saddle', [diam('d1', '본관 지름 Ød', keysAsNumbers(saddlePairs)), diam('d3', '분기 지름 Ød3', [])], { pairs: saddlePairs }),
    ] },
    { name: '커플링 · 리듀서', page: 7, models: [
      model('CPM', '커플링', 'coupling', [diam('d1', '접속 지름 Ø', standardFittingDiameters)], { legacyDiameters: fittingDiameters }),
      model('CPMF1', '한쪽 플랜지 커플링', 'coupling'),
      model('CPMF2', '양쪽 플랜지 커플링', 'coupling'), model('CPMG', '가스켓 커플링', 'coupling'),
      model('CPMSP', '스핀형 커플링', 'coupling'), model('CPF', '피팅용 커플링', 'coupling'),
      ...pair('RD', '편 리듀서', 'roundReducer', reducedEnds, { branch: true, reduction: true, checkCombination: true }),
      ...pair('RDP', '프레스 리듀서', 'reducer', diameterPair(pressedReducerPairs), { pairs: pressedReducerPairs }),
    ] },
    { name: '캡 · 삿갓 · 플랫덕트', page: 7, models: [
      ...pair('CAPM', '캡', 'cap'),
      model('CAPMP', '프레스 캡 (CAPMP)', 'cap', [diam('d1', '접속 지름 Ø', pressedCaps)]),
      model('CAPFP', '프레스 캡 (CAPFP)', 'cap', [diam('d1', '접속 지름 Ø', pressedCaps)]),
      model('SGNH', '행거형 삿갓', 'hood'), model('SGNC', '소켓형 삿갓', 'hood'),
      model('SGPHWC', '역풍방지 삿갓', 'hood'),
      model('FLD', '플랫덕트', 'flat', [measure('length', '가로 L'), measure('width', '세로 W'), measure('height', '높이 H'),
        { ...measure('d1', '직경 D'), diameter: true }, measure('height2', '고 H2')]),
    ] },
    { name: '트랜지션 · 테이크오프 · 밴드 · 행거', page: 8, models: [
      model('TR', '트랜지션 (홉빠)', 'transition', [...transition, { key: 'flange', label: '플랜지 마감', options: Object.keys(flangeOptions) }]),
      model('TRTDF', '트랜지션 (TDF)', 'transition', transition),
      model('TO', '테이크오프', 'takeoff', [diam('d1', '접속 지름 Ø', [75, 100, 125, 150, 200, 250, 300])]),
      model('VB', 'V밴드', 'band'), model('HG', 'O자형 행거', 'band', one, { hardware: '볼트·너트 포함' }),
      model('UB', 'U자형 행거', 'band', one, { hardware: '볼트·너트 별도' }),
      model('HGR', '반달형 행거', 'band', one, { hardware: '볼트·너트 포함 · 2개 1조', unit: '조' }),
      model('HGS', '단축 행거', 'band', one, { hardware: '볼트·너트 별도' }),
    ] },
  ];
  const models = new Map();
  for (const group of groups) {
    for (const item of group.models) {
      item.page = group.page;
      if (item.code === 'EB90G') item.elbowLength = press90G;
      if (item.code === 'EB45G') item.elbowLength = press45G;
      models.set(item.id, item);
    }
  }
  // Removed models still describe items that already exist in saved orders and drafts.
  const orderModels = ['SP', 'EB45', 'EB90', 'CPM', 'TO', 'CNT', 'CMT', 'RT', 'YB', 'YTB', 'RD'].map(id => models.get(id));
  const { dampers, damperLength } = orderCalculations;
  for (const [damper, code] of Object.entries(dampers)) {
    const item = model(code, `원형 ${code} 댐퍼`, 'damper', [diam('d1', '접속 지름 Ø', standardFittingDiameters)],
      { id: `damper-${damper}`, damper, fixedLength: damperLength });
    models.set(item.id, item);
    orderModels.push(item);
  }
  const isOrderModel = id => orderModels.some(model => model.id === id);

  function optionsFor(model, field, params) {
    if (model.pairs && field !== model.fields[0]) return model.pairs[params.d1] || [];
    if (model.reduction && field.key === 'd2') return params.d1 ? field.options.filter(value => value < params.d1) : [];
    return field.options;
  }

  function acceptsLegacyDiameter(model, diameter) {
    return model.damper ? Number.isSafeInteger(diameter) && diameter > 0 : Boolean(model.legacyDiameters?.includes(diameter));
  }

  function valid(item) {
    const model = models.get(item.model);
    if (!model || !item.params) return false;
    const thickness = item.spiralThickness;
    // Older orders can still carry a manually entered thickness or a product standard.
    if (thickness !== null && (!Number.isFinite(thickness) || thickness <= 0)) return false;
    return model.fields.every(field => {
      const value = item.params[field.key];
      const options = optionsFor(model, field, item.params);
      if (field.key === 'd1' && acceptsLegacyDiameter(model, value)) return true;
      return options ? options.includes(value) : Number.isSafeInteger(value) && value > 0;
    });
  }

  const stockLengthText = length => `${length / 1000}M`;

  function spec(item, format) {
    const model = models.get(item.model);
    const params = item.params;
    const parts = model.fields.filter(field => field.key !== 'flange' && field.key !== 'runLength').map(field => {
      const value = params[field.key];
      if (field.diameter) return `Ø${format(value)}`;
      if (model.id === 'SP' && field.key === 'length') return stockLengthText(value);
      const symbol = { length: 'L', width: 'W', height: 'H', height2: 'H2=', l1: 'l1 ', l2: 'l2 ' }[field.key] || field.key;
      return `${symbol}${format(value)}`;
    });
    if (model.fixedLength) parts.push(`L${format(model.fixedLength)}`);
    return parts.join(' × ');
  }

  function details(item, format) {
    const model = models.get(item.model);
    if (!model) return [];
    const length = model.elbowLength?.[item.params.d1];
    const entries = [model.code];
    if (length) entries.push(`L${format(length)}${model.checkCombination ? ' (Ød1 기준)' : ''}`);
    if (item.params.flange) entries.push(flangeOptions[item.params.flange]);
    if (model.hardware) entries.push(model.hardware);
    return entries;
  }

  return { orderModels, isOrderModel, get: id => models.get(id), optionsFor, valid, spec, details, flangeOptions,
    acceptsLegacyDiameter, stockLengthText, thicknessChoices, defaultThickness };
})();
