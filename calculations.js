'use strict';

const orderCalculations = (() => {
  const stockLength = 1430;
  const offsetMaxLength = 1430;
  const branchLength = 200;
  const damperLength = 250;
  const branchWidening = 150;
  const thickThreshold = 750;
  const materials = {
    galvanized: { label: '아연도강판', thinLimit: 450 },
    galvalume: { label: '갈바륨' },
    sts201: { label: 'STS 201', thinLimit: thickThreshold },
    sts304: { label: 'STS 304', thinLimit: thickThreshold },
  };
  const dampers = { vd: 'V.D', mvd: 'M.V.D', fd: 'F.D', mfd: 'M.F.D' };
  // D.S. Industry DR/DS/DSR and ND product dimension tables (p-6-1 and p-6-5).
  const neckByNominal = { 100: 95, 125: 120, 150: 145, 200: 195, 250: 245, 300: 295, 350: 345, 400: 395 };
  const panModels = (prefix, faces) => faces.flatMap(([face, sizes]) => sizes.map(nominal => ({
    code: `${prefix} ${face}-${nominal}`, nominal, face, neck: neckByNominal[nominal]
  })));
  const diffusers = {
    roundDiffuser: { label: '원형팬 디퓨저', roundFace: true, models: panModels('DR', [
      [250, [100, 125, 150]], [320, [100, 125, 150, 200]], [420, [200, 250]],
      [480, [250, 300]], [550, [300, 350]], [650, [350, 400]]
    ]) },
    squareDiffuser: { label: '사각팬 디퓨저', roundFace: false, models: panModels('DS', [
      [300, [100, 125, 150, 200]], [410, [200, 250]], [460, [250, 300]]
    ]) },
    squareRoundDiffuser: { label: '각원팬 디퓨저', roundFace: false, models: panModels('DSR', [
      [300, [100, 125, 150, 200]], [410, [200, 250]], [460, [250, 300]], [600, [350, 400]]
    ]) },
    nozzleDiffuser: { label: '노즐디퓨저', roundFace: true,
      models: [[100, 150], [125, 175], [150, 200], [200, 250], [250, 200], [300, 350]].map(([nominal, face]) => ({
        code: `ND ${nominal}`, nominal, face, neck: neckByNominal[nominal]
      }))
    }
  };
  const outlets = { grille: '그릴', register: '레지스터', louver: '루버',
    ...Object.fromEntries(Object.entries(diffusers).map(([type, diffuser]) => [type, diffuser.label])) };
  const isDamper = type => Object.hasOwn(dampers, type);
  const isAirOutlet = type => Object.hasOwn(outlets, type);
  const ductNames = {
    straight: '각형덕트', elbow: '90° 엘보', elbow45: '45° 엘보', offset: '고바이', reducer: '레두샤', branch: '분기구',
    ...Object.fromEntries(Object.entries(dampers).map(([type, code]) => [type, `각형 ${code} 댐퍼`])), ...outlets, spiral: '스파이럴덕트'
  };
  const elbowAngles = { elbow: 90, elbow45: 45 };
  const levelLabels = { top: '상수평', bottom: '하수평', center: '중심' };
  const sideLabels = { center: '양고', left: '좌편심', right: '우편심' };
  const typeOrder = Object.keys(ductNames);
  const ductType = item => item.type ?? 'straight';
  const itemName = item => item.type === 'spiral' ? spiralCatalog.get(item.model)?.name || ductNames.spiral : ductNames[ductType(item)];
  const itemUnit = item => item.type === 'spiral' ? spiralCatalog.get(item.model)?.unit || 'EA' : 'EA';
  const numberFormat = new Intl.NumberFormat('ko-KR');
  const format = value => numberFormat.format(value);
  const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  const hasTwoEnds = type => type === 'reducer' || type === 'branch';
  const hasOutletDimensions = ({ outletWidth, outletHeight }) => positiveInteger(outletWidth) && positiveInteger(outletHeight);
  const longSide = ({ width, height, outletWidth = 0, outletHeight = 0 }) => Math.max(width, height, outletWidth, outletHeight);

  function branchGeometry(dimensions) {
    if (!dimensions) return { type: 'branch', length: branchLength };
    const { width, height } = dimensions;
    const widenWidth = width >= height;
    return { type: 'branch', length: branchLength, outletWidth: width + (widenWidth ? branchWidening : 0),
      outletHeight: height + (widenWidth ? 0 : branchWidening) };
  }

  function parseDimensions(text) {
    const pattern = /^(\d+|\d{1,3}(?:,\d{3})+)\s*[x×*✕]\s*(\d+|\d{1,3}(?:,\d{3})+)$/i;
    const match = pattern.exec(text.normalize('NFKC').trim());
    if (!match) return null;
    const [width, height] = match.slice(1).map(value => Number(value.replaceAll(',', '')));
    return positiveInteger(width) && positiveInteger(height) ? { width, height } : null;
  }

  function plateThickness(material, dimensions) {
    if (!dimensions) return null;
    if (isAirOutlet(dimensions.type)) return null;
    if (dimensions.type === 'spiral') return dimensions.spiralThickness ?? null;
    const sideLength = longSide(dimensions);
    if (sideLength > thickThreshold) return 0.8;
    if (!Object.hasOwn(materials, material)) return null;
    return sideLength <= materials[material].thinLimit ? 0.5 : 0.6;
  }

  function splitRun(length, repeat, cutLength = stockLength) {
    if (!positiveInteger(length) || !positiveInteger(repeat) || !positiveInteger(cutLength) || !positiveInteger(length * repeat)) return [];
    const standard = Math.floor(length / cutLength);
    const remainder = length % cutLength;
    const pieces = [];
    if (standard) pieces.push({ length: cutLength, quantity: standard * repeat });
    if (remainder) pieces.push({ length: remainder, quantity: repeat });
    return pieces;
  }

  function hbKey({ type, width, height, outletWidth, outletHeight, insulation, artilon, model, params }) {
    let ends = hasTwoEnds(type) ? `${type}|${width}x${height}>${outletWidth}x${outletHeight}` : `${width}x${height}`;
    if (type === 'spiral') {
      const profile = spiralCatalog.get(model).fields.filter(field => field.diameter || ['width', 'height', 'l1', 'l2'].includes(field.key));
      ends = `spiral|${model}|${profile.map(field => params[field.key]).join('x')}`;
    }
    if (insulation === 'rubber') return `${ends}|rubber|13`;
    if (insulation === 'artilon' && artilon) return `${ends}|artilon|${artilon}`;
    return '';
  }

  function insulationText({ insulation, artilon }) {
    if (insulation === 'rubber') return '고무발포 13T';
    if (insulation === 'artilon') return `아티론 ${artilon ? `${artilon}T` : '(두께 확인 필요)'}`;
    return '미사용';
  }

  function offsetDetails({ rise, length, inlet, equalEndStraights }) {
    const straights = inlet === null ? 'C 미적용' : `C${format(inlet)}${equalEndStraights ? ' (양쪽)' : ''}`;
    return `H${format(rise)} · L${format(length)} · ${straights}`;
  }

  const crossSectionText = ({ width, height }) => `${format(width)} × ${format(height)}`;
  const outletSectionText = ({ outletWidth, outletHeight }) => crossSectionText({ width: outletWidth, height: outletHeight });
  const diffuserFaceText = (type, width, height = width) => diffusers[type].roundFace ? `Ø${format(width)}` : crossSectionText({ width, height });

  function reducerDetails({ length, level, side }) {
    return `L${format(length)} · ${levelLabels[level]} · ${sideLabels[side]}`;
  }

  const twoEndDetails = item => item.type === 'reducer' ? reducerDetails(item) : `L${format(item.length)}`;

  function specText(item) {
    if (item.type === 'spiral') return spiralCatalog.spec(item, format);
    const { length, radius } = item;
    const section = crossSectionText(item);
    const type = ductType(item);
    if (diffusers[type]) {
      const face = diffuserFaceText(type, item.width, item.height);
      return item.diffuserModel
        ? `${item.diffuserModel} · 호칭 Ø${format(item.diffuserNominal)} / Face(D) ${face} / 목(A) Ø${format(item.neck)}`
        : `전면 ${face} / 목 Ø${format(item.neck)}`;
    }
    if (isAirOutlet(type)) return section;
    if (type === 'offset') return `${section} / ${offsetDetails(item)}`;
    if (hasTwoEnds(type)) return `${section} → ${outletSectionText(item)} / ${twoEndDetails(item)}`;
    if (elbowAngles[type]) return `${section} × R${format(radius)}`;
    return `${section} × ${format(length)}`;
  }

  function orderPieces(item) {
    if (ductType(item) === 'straight') return splitRun(item.length, item.repeat, item.cutLength);
    return positiveInteger(item.repeat) ? [{ quantity: item.repeat }] : [];
  }

  function orderQuantity(item) {
    return orderPieces(item).reduce((sum, piece) => sum + piece.quantity, 0);
  }

  function quantityText(items, count = item => item.quantity) {
    const sums = { EA: 0, 조: 0 };
    for (const item of items) sums[itemUnit(item)] += count(item);
    return Object.entries(sums).filter(([, quantity]) => quantity).map(([unit, quantity]) => `${format(quantity)} ${unit}`).join(' · ') || '0 EA';
  }

  function orderItems(runs) {
    const items = new Map();
    for (const run of runs) {
      const { width, height, material, insulation, artilon, hb, reinforcementWidth, memo } = run;
      const type = ductType(run);
      for (const piece of orderPieces(run)) {
        const productionLength = piece.length ?? run.length;
        const shape = type === 'spiral' ? [run.model, run.params, run.spiralThickness]
          : [width, height, productionLength, run.radius, run.rise, run.inlet, run.equalEndStraights, run.outletWidth,
            run.outletHeight, run.level, run.side, run.neck, run.diffuserModel];
        const key = JSON.stringify([type, ...shape, material, insulation, artilon, hb, reinforcementWidth, memo]);
        const item = items.get(key);
        if (item) item.quantity += piece.quantity;
        else items.set(key, { ...run, type, ...piece, plate: plateThickness(material, run) });
      }
    }
    return [...items.values()].sort((a, b) => Number(a.type === 'spiral') - Number(b.type === 'spiral')
      || (b.width ?? b.params?.d1 ?? 0) - (a.width ?? a.params?.d1 ?? 0) || (b.height ?? 0) - (a.height ?? 0)
      || (a.material ?? '').localeCompare(b.material ?? '') || typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
      || (b.length ?? 0) - (a.length ?? 0) || (b.radius ?? 0) - (a.radius ?? 0));
  }

  function missingDetails(item) {
    const missing = [];
    if (item.type === 'offset' && item.length > offsetMaxLength) missing.push('고바이 총길이 L');
    if (item.type === 'spiral' && spiralCatalog.get(item.model)?.checkCombination) missing.push('제조사 지름 조합');
    if (item.insulation === 'artilon' && !item.artilon) missing.push('아티론 두께');
    if (item.insulation !== 'none' && !item.hb) missing.push('HB');
    return missing;
  }

  return { stockLength, offsetMaxLength, damperLength, dampers, diffusers, isDamper, isAirOutlet, materials, ductNames, ductType, itemName, itemUnit, elbowAngles, levelLabels, sideLabels,
    format, positiveInteger, hasOutletDimensions, hasTwoEnds, branchGeometry, longSide, parseDimensions, plateThickness, splitRun, hbKey,
    insulationText, specText, crossSectionText, outletSectionText, diffuserFaceText, offsetDetails, twoEndDetails, orderPieces, orderQuantity, quantityText, orderItems, missingDetails };
})();
