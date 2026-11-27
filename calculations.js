'use strict';

const orderCalculations = (() => {
  const stockLength = 1430;
  const offsetMaxLength = 1430;
  const branchLength = 200;
  const damperLength = 250;
  const branchWidening = 150;
  const thickThreshold = 750;
  const materials = {
    galvanized: { label: '아연도금강판', thinLimit: 450 },
    galvalume: { label: '갈바륨' },
    aluminum: { label: '알루미늄' },
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
  const defaultMaterial = type => isAirOutlet(type) && !diffusers[type] ? 'aluminum' : 'galvanized';
  const ductNames = {
    straight: '각형덕트', elbow: '90° 엘보', elbow45: '45° 엘보', offset: '고바이', reducer: '레두샤', branch: '분기구',
    ...Object.fromEntries(Object.entries(dampers).map(([type, code]) => [type, `각형 ${code} 댐퍼`])),
    spiral: '스파이럴덕트', oval: '오발덕트', flex: '플렉시블 덕트', ...outlets
  };
  const elbowAngles = { elbow: 90, elbow45: 45 };
  const levelLabels = { top: '상수평', bottom: '하수평', center: '중심' };
  const sideLabels = { center: '양고', left: '좌편심', right: '우편심' };
  const typeOrder = Object.keys(ductNames);
  const ductType = item => item.type ?? 'straight';
  const isCatalogItem = type => type === 'spiral' || type === 'oval' || type === 'flex';
  const itemName = item => (isCatalogItem(item.type) ? spiralCatalog.get(item.model)?.name : null) || ductNames[ductType(item)];
  const itemUnit = item => (isCatalogItem(item.type) ? spiralCatalog.get(item.model)?.unit : null) || 'EA';
  const numberFormat = new Intl.NumberFormat('ko-KR');
  const format = value => numberFormat.format(value);
  const diameterText = value => `${format(value)}Ø`;
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
    if (isAirOutlet(dimensions.type) || dimensions.type === 'flex') return null;
    if (isCatalogItem(dimensions.type)) return dimensions.spiralThickness ?? null;
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

  function insulationText({ insulation, artilon }) {
    if (insulation === 'rubber') return '고무발포 13T';
    if (insulation === 'artilon') return artilon ? `아티론 ${artilon}T` : '아티론';
    return '미사용';
  }

  function offsetDetails({ rise, length, inlet, equalEndStraights }) {
    const main = `H${format(rise)} · L${format(length)}`;
    return positiveInteger(inlet) ? `${main} · C${format(inlet)}${equalEndStraights ? ' (양쪽)' : ''}` : main;
  }

  const crossSectionText = ({ width, height }) => `${format(width)} × ${format(height)}`;
  const outletSectionText = ({ outletWidth, outletHeight }) => crossSectionText({ width: outletWidth, height: outletHeight });
  const diffuserFaceText = (type, width, height = width) => diffusers[type].roundFace ? `Ø${format(width)}` : crossSectionText({ width, height });

  function reducerDetails({ length, level, side }) {
    return `L${format(length)} · ${levelLabels[level]} · ${sideLabels[side]}`;
  }

  const twoEndDetails = item => item.type === 'reducer' ? reducerDetails(item) : `L${format(item.length)}`;

  function specText(item) {
    if (isCatalogItem(item.type)) return spiralCatalog.spec(item, format);
    const { length, radius } = item;
    const section = crossSectionText(item);
    const type = ductType(item);
    if (diffusers[type]) {
      const model = diffusers[type].models.find(model => model.code === item.diffuserModel);
      const diameter = diameterText(item.diffuserNominal ?? model?.nominal ?? item.neck);
      if (type === 'nozzleDiffuser') return diameter;
      const face = diffusers[type].roundFace || item.width === item.height ? format(item.width) : section;
      return `D${face}-${diameter}`;
    }
    if (isAirOutlet(type)) return section;
    if (type === 'offset') return `${section} / ${offsetDetails(item)}`;
    if (hasTwoEnds(type)) return `${section} → ${outletSectionText(item)} / ${twoEndDetails(item)}`;
    if (elbowAngles[type]) return `${section} × R${format(radius)}`;
    return `${section} × ${format(length)}`;
  }

  function orderPieces(item) {
    if (ductType(item) === 'straight') return splitRun(item.length, item.repeat, item.cutLength);
    if (isCatalogItem(item.type) && spiralCatalog.isStock(item.model) && item.params.runLength !== undefined) {
      const { runLength, ...params } = item.params;
      const length = spiralCatalog.stockLengthFor(item);
      const quantity = splitRun(runLength, item.repeat, length).reduce((total, piece) => total + piece.quantity, 0);
      return quantity ? [{ params, quantity }] : [];
    }
    return positiveInteger(item.repeat) ? [{ quantity: item.repeat }] : [];
  }

  function orderQuantity(item) {
    return orderPieces(item).reduce((sum, piece) => sum + piece.quantity, 0);
  }

  function quantityText(items, count = item => item.quantity) {
    const sums = { EA: 0, 조: 0, 박스: 0 };
    for (const item of items) sums[itemUnit(item)] += count(item);
    return Object.entries(sums).filter(([, quantity]) => quantity).map(([unit, quantity]) => `${format(quantity)} ${unit}`).join(' · ') || '0 EA';
  }

  function compareItems(a, b) {
    const type = ductType(a);
    const byType = typeOrder.indexOf(type) - typeOrder.indexOf(ductType(b));
    if (byType) return byType;
    if (isCatalogItem(type)) {
      return spiralCatalog.compareModels(a.model, b.model)
        || (a.params.d1 ?? 0) - (b.params.d1 ?? 0)
        || (a.params.depth1 ?? 0) - (b.params.depth1 ?? 0)
        || (a.params.d2 ?? 0) - (b.params.d2 ?? 0)
        || (a.params.depth2 ?? 0) - (b.params.depth2 ?? 0)
        || (a.params.d3 ?? 0) - (b.params.d3 ?? 0)
        || (a.params.depth3 ?? 0) - (b.params.depth3 ?? 0)
        || (a.params.d4 ?? 0) - (b.params.d4 ?? 0)
        || (b.params.length ?? 0) - (a.params.length ?? 0);
    }
    return a.width - b.width || (a.height ?? 0) - (b.height ?? 0) || (a.neck ?? 0) - (b.neck ?? 0)
      || (a.outletWidth ?? 0) - (b.outletWidth ?? 0) || (a.outletHeight ?? 0) - (b.outletHeight ?? 0)
      || (b.length ?? 0) - (a.length ?? 0) || (a.radius ?? 0) - (b.radius ?? 0);
  }

  function orderItems(runs) {
    const items = new Map();
    for (const run of runs) {
      const { width, height, insulation, artilon, voltage, phase, reinforcementWidth, memo } = run;
      const type = ductType(run);
      const material = isAirOutlet(type) ? run.material ?? defaultMaterial(type) : run.material;
      const showPlate = run.plateNote !== 'hide';
      for (const piece of orderPieces(run)) {
        const productionLength = piece.length ?? run.length;
        const shape = isCatalogItem(type) ? [run.model, piece.params ?? run.params, run.spiralThickness]
          : [width, height, productionLength, run.radius, run.rise, run.inlet, run.equalEndStraights, run.outletWidth,
            run.outletHeight, run.level, run.side, run.neck, run.diffuserModel, run.neckDimensions];
        const key = JSON.stringify([type, ...shape, material, showPlate, insulation, artilon, voltage, phase, reinforcementWidth, memo]);
        const item = items.get(key);
        if (item) item.quantity += piece.quantity;
        else items.set(key, { ...run, type, ...piece, material, plate: plateThickness(material, run) });
      }
    }
    return [...items.values()].sort(compareItems);
  }

  function missingDetails(item) {
    const missing = [];
    if (item.type === 'offset' && item.length > offsetMaxLength) missing.push('고바이 총길이 L');
    if (isCatalogItem(item.type) && spiralCatalog.get(item.model)?.checkCombination) missing.push('제조사 지름 조합');
    return missing;
  }

  return { stockLength, offsetMaxLength, damperLength, dampers, diffusers, isDamper, isAirOutlet, isCatalogItem, materials, defaultMaterial, ductNames, ductType, itemName, itemUnit, elbowAngles, levelLabels, sideLabels,
    format, diameterText, positiveInteger, hasOutletDimensions, hasTwoEnds, branchGeometry, longSide, parseDimensions, plateThickness, splitRun,
    insulationText, specText, crossSectionText, outletSectionText, diffuserFaceText, offsetDetails, twoEndDetails, orderPieces, orderQuantity, quantityText, compareItems, orderItems, missingDetails };
})();
