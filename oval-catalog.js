'use strict';

const ovalCatalog = (() => {
  const depths = [40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500];
  // D.S. Industry Oval_Ducts_chart.jpg. Each row has the nominal diameter, first depth, and consecutive widths.
  const chart = [
    [125, 40, 174, 168],
    [150, 40, 213, 207, 202, 193],
    [175, 40, 252, 247, 241, 232, 218, 204],
    [200, 40, 292, 286, 280, 272, 257, 243, 229],
    [225, 50, 325, 320, 311, 297, 282, 268],
    [250, 60, 359, 350, 336, 322, 307, 279],
    [275, 75, 389, 375, 361, 347, 318],
    [300, 75, 429, 414, 400, 386, 357],
    [325, 75, 468, 454, 439, 425, 397],
    [350, 100, 493, 479, 464, 436],
    [375, 150, 504, 475],
    [400, 150, 543, 514],
    [425, 150, 582, 554],
    [450, 150, 621, 593, 564],
    [475, 150, 661, 632, 604, 575, 547],
    [500, 150, 700, 671, 643, 614, 586],
    [525, 150, 739, 711, 682, 654, 625, 597],
    [550, 150, 778, 750, 721, 693, 664, 636],
    [575, 200, 789, 761, 732, 704, 675],
    [600, 200, 828, 800, 771, 743, 714, 686, 657],
    [625, 200, 868, 839, 811, 782, 754, 725, 697],
    [650, 200, 907, 878, 850, 821, 793, 764, 736],
    [675, 200, 946, 918, 889, 861, 832, 804, 775],
    [700, 200, 985, 957, 928, 900, 871, 843, 814],
    [725, 250, 996, 968, 939, 911, 882, 854],
    [750, 250, 1035, 1007, 978, 950, 921, 893],
    [775, 250, 1075, 1046, 1018, 989, 961, 932],
    [800, 250, 1114, 1085, 1057, 1028, 1000, 971],
    [850, 250, 1192, 1164, 1135, 1107, 1078, 1050],
    [900, 250, 1271, 1242, 1214, 1185, 1157, 1128],
    [950, 300, 1321, 1292, 1264, 1235, 1207],
    [1000, 300, 1399, 1371, 1342, 1314, 1285],
    [1050, 300, 1478, 1450, 1421, 1392, 1364],
    [1100, 300, 1556, 1528, 1499, 1471, 1442],
    [1150, 350, 1606, 1578, 1549, 1521],
    [1200, 350, 1685, 1656, 1628, 1599],
    [1250, 350, 1763, 1735, 1706, 1678],
    [1300, 350, 1842, 1813, 1785, 1756],
    [1350, 350, 1920, 1892, 1863, 1835],
    [1400, 400, 1970, 1942, 1913],
    [1450, 450, 2020, 1992],
  ];
  const widths = new Map(chart.map(([nominal, firstDepth, ...row]) => [
    nominal, new Map(row.map((width, index) => [depths[depths.indexOf(firstDepth) + index], width])),
  ]));
  const nominalSizes = [125, 150, 200, 250, 300, 350, 400];
  const stockLength = { key: 'length', label: '정척 (한 본 길이)', options: [4000, 2000], defaultValue: 4000 };
  const orientation = { key: 'orientation', label: '방향', options: ['V', 'H'], optionLabels: { V: 'V형 (세움)', H: 'H형 (눕힘)' } };
  const ovalEnd = (end, label) => [
    { key: `d${end}`, label: `${label} 호칭 Ød${end}`, options: nominalSizes, diameter: true, ovalEnd: end },
    { key: `depth${end}`, label: `${label} 깊이 D / 너비 W`, options: [], ovalDepth: end },
  ];
  const roundEnd = (end, label) => ({ key: `d${end}`, label: `${label} 원형 지름 Ø`, options: [], diameter: true });
  const inlet = ovalEnd(1, '입구');
  const ends = [...inlet, ...ovalEnd(2, '출구')];
  const tee = [...ends, ...ovalEnd(3, '분기')];
  const model = (id, name, shape, fields, extra = {}) => ({ id, code: id, type: 'oval', name, shape, fields, page: '2-2', ...extra });
  const models = [
    model('OD', '오발 직관', 'ovalDuct', [...ovalEnd(1, '직관'), stockLength, { key: 'runLength', label: '한 구간 전체 길이 L' }],
      { page: '2-1' }),
    model('OEB90', '오발 90° 엘보', 'elbow90', [orientation, ...inlet], { codes: { V: 'OEB90V', H: 'OEB90H' } }),
    model('OEB45', '오발 45° 엘보', 'elbow45', [orientation, ...inlet], { codes: { V: 'OEB45V', H: 'OEB45H' } }),
    model('OEB', '오발 둔각 엘보', 'ovalOffset', [orientation, ...inlet, { key: 'rise', label: '높이 차 H' }, { key: 'length', label: '제작 길이 L' }],
      { codes: { V: 'OEBV', H: 'OEBH' } }),
    model('OSB', '오발 직각 엘보', 'ovalBend', [orientation, ...inlet], { codes: { V: 'OSBV' } }),
    model('OT', '오발 티', 'conicalTee', [orientation, ...tee], { codes: { V: 'OTV', H: 'OTH' }, checkCombination: true }),
    model('OTOS', '오발–원형 티', 'combinationTee', [orientation, ...inlet, roundEnd(2, '분기')], { codes: { V: 'OTOSV', H: 'OTOSH' }, checkCombination: true }),
    model('ORD', '오발 리듀서', 'roundReducer', ends, { checkCombination: true }),
    model('ORDOS', '오발–원형 리듀서', 'roundReducer', [...inlet, roundEnd(2, '출구')], { checkCombination: true }),
    model('OYB', '오발 Y 브랜치', 'yBranch', [orientation, ...tee], { codes: {}, checkCombination: true }),
    model('OYTB', '오발 YT 브랜치', 'ytBranch', [orientation, ...tee], { codes: {}, checkCombination: true }),
    model('OCAP', '오발 캡', 'cap', inlet),
    model('OCP', '오발 커플링', 'coupling', inlet),
  ];
  const depthOptions = nominal => [...(widths.get(nominal)?.keys() ?? [])];
  const widthFor = (nominal, depth) => widths.get(nominal)?.get(depth);
  const code = (model, params) => model.codes ? model.codes[params.orientation] : model.code;

  function specParts(model, params, format) {
    return model.fields.flatMap(field => {
      const value = params[field.key];
      if (field.ovalDepth || field.key === 'runLength' || field.key === 'length' && model.id === 'OD') return [];
      if (field.ovalEnd) {
        const depth = params[`depth${field.ovalEnd}`];
        return `Ø${format(value)} (D${format(depth)} × W${format(widthFor(value, depth))})`;
      }
      if (field.diameter) return `Ø${format(value)}`;
      if (field.key === 'orientation') return value ? `${value}형` : [];
      return `${field.key === 'rise' ? 'H' : 'L'}${format(value)}`;
    });
  }

  return { models, depthOptions, widthFor, code, specParts };
})();
