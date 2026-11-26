'use strict';

function drawFittingDiagram(canvas, geometry, size, includeInlet) {
  const { type, outletWidth, outletHeight, level, side } = geometry;
  const { elbowAngles, levelLabels, sideLabels, format, positiveInteger } = orderCalculations;
  const elbowAngle = elbowAngles[type];
  const height = elbowAngle ? 180 : type === 'reducer' || type === 'branch' ? 148 : 160;
  if (canvas.height !== 2 * height) canvas.height = 2 * height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const drawInlet = includeInlet === 'yes' && positiveInteger(geometry.inlet);
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.clearRect(0, 0, 400, height);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  const value = (symbol, amount) => positiveInteger(amount) || (symbol === 'R' && amount === 0) ? `${symbol} ${format(amount)}` : symbol;
  const section = (first, second, width, height) => `${positiveInteger(width) ? format(width) : first} × ${positiveInteger(height) ? format(height) : second}`;
  const inletSection = section('A', 'B', size.width, size.height);
  const outletSection = section('C', 'D', outletWidth, outletHeight);

  function line(points, color = '#467062', width = 1) {
    context.beginPath();
    for (const [x, y] of points) context.lineTo(x, y);
    context.lineWidth = width;
    context.strokeStyle = color;
    context.stroke();
  }

  function label(text, x, y, align = 'center', maxWidth = 380) {
    context.fillStyle = '#17614c';
    context.font = '700 14px "Malgun Gothic", sans-serif';
    context.textBaseline = 'middle';
    context.textAlign = align;
    const available = align === 'left' ? 394 - x : align === 'right' ? x - 6 : 2 * Math.min(x - 6, 394 - x);
    context.fillText(text, x, y, Math.min(available, maxWidth));
  }

  function arrow(x, y, direction) {
    const xBase = x - 6 * Math.cos(direction);
    const yBase = y - 6 * Math.sin(direction);
    const dx = 2.5 * Math.sin(direction);
    const dy = 2.5 * Math.cos(direction);
    line([[xBase + dx, yBase - dy], [x, y], [xBase - dx, yBase + dy]]);
  }

  function dimension(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    line([[x1, y1], [x2, y2]]);
    arrow(x1, y1, angle + Math.PI);
    arrow(x2, y2, angle);
  }

  function paintDuct(fill = '#dcece3') {
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 1.9;
    context.strokeStyle = '#233f35';
    context.stroke();
  }

  if (orderCalculations.isDamper(type)) {
    context.save();
    context.translate(94, 6);
    drawDamperBody(context, type);
    context.restore();
    label(inletSection, 122, 113);
    line([[128, 116], [128, 143]]);
    line([[256, 101], [256, 143]]);
    dimension(128, 140, 256, 140);
    label(value('L', geometry.length), 192, 129);
    return;
  }

  if (orderCalculations.isAirOutlet(type)) {
    const diffuser = orderCalculations.diffusers[type];
    const faceX = diffuser ? 85 : 145;
    context.save();
    context.translate(faceX, 16);
    drawOutletFace(context, type);
    context.restore();
    const inside = !diffuser || diffuser.roundFace;
    const left = faceX + (inside ? 16 : 6);
    const right = faceX + (inside ? 104 : 114);
    line([[left, diffuser ? 114 : 100], [left, 138]]);
    line([[right, diffuser ? 114 : 100], [right, 138]]);
    dimension(left, 134, right, 134);
    const faceLabel = diffuser
      ? positiveInteger(size.width) ? `Face(D) ${orderCalculations.diffuserFaceText(type, size.width, size.height)}` : 'Face(D)'
      : value('목 가로', size.width);
    label(faceLabel, faceX + 60, 148);
    if (!diffuser?.roundFace) {
      const top = diffuser ? 22 : 32;
      const bottom = diffuser ? 110 : 100;
      line([[faceX - 8, top], [left, top]]);
      line([[faceX - 8, bottom], [left, bottom]]);
      dimension(faceX - 9, top, faceX - 9, bottom);
      label(value(diffuser ? '세로' : '목 세로', size.height), faceX - 16, 66, 'right');
    }
    if (diffuser) {
      context.beginPath();
      context.moveTo(231, 98);
      context.quadraticCurveTo(241, 92, 245, 78);
      context.lineTo(323, 78);
      context.quadraticCurveTo(327, 92, 337, 98);
      context.closePath();
      paintDuct();
      context.beginPath();
      context.rect(256, 48, 56, 30);
      paintDuct('#c5dacd');
      line([[256, 46], [256, 36]]);
      line([[312, 46], [312, 36]]);
      dimension(256, 39, 312, 39);
      label(value('목(A) Ø', geometry.neck), 284, 25);
    }
    return;
  }

  if (type === 'straight') {
    context.beginPath();
    context.rect(92, 47, 216, 61);
    paintDuct();
    line([[92, 41], [92, 114]], '#233f35', 1.35);
    line([[308, 41], [308, 114]], '#233f35', 1.35);
    label(inletSection, 80, 78, 'right');
    line([[92, 118], [92, 139]]);
    line([[308, 118], [308, 139]]);
    dimension(92, 135, 308, 135);
    label(value('L', geometry.length), 200, 124);
    if (positiveInteger(geometry.cutLength)) label(value('분할 기준', geometry.cutLength), 200, 78);
    return;
  }

  if (elbowAngle) {
    const width = size.width || 500;
    const ductHeight = size.height || 300;
    const innerRadius = Number.isSafeInteger(geometry.radius) && geometry.radius >= 0 ? geometry.radius : width * 0.4;
    const outerRadius = innerRadius + width;
    const endLength = Math.min(width, ductHeight) * 0.16;
    const startAngle = Math.PI;
    const endAngle = startAngle + elbowAngle * Math.PI / 180;
    const yaw = 0.57;
    const elevation = 0.55;

    function sectionAt(angle, advance = 0, inset = 0) {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const vertex = (radius, z) => [radius * cos - advance * sin, radius * sin + advance * cos, z];
      return [vertex(innerRadius + inset, inset), vertex(outerRadius - inset, inset),
        vertex(outerRadius - inset, ductHeight - inset), vertex(innerRadius + inset, ductHeight - inset)];
    }

    function view([x, y, z]) {
      return [x * Math.sin(yaw) - y * Math.cos(yaw),
        (x * Math.cos(yaw) + y * Math.sin(yaw)) * Math.sin(elevation) - z * Math.cos(elevation)];
    }

    const steps = 24;
    const bendAngles = Array.from({ length: steps + 1 }, (_, index) => startAngle + (endAngle - startAngle) * index / steps);
    const stations = [sectionAt(startAngle, -endLength), ...bendAngles.map(angle => sectionAt(angle)), sectionAt(endAngle, endLength)];
    const projected = stations.flat().map(view);
    const xs = projected.map(point => point[0]);
    const ys = projected.map(point => point[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(198 / (maxX - minX), 122 / (maxY - minY));
    const toCanvas = ([x, y]) => [200 + (x - (minX + maxX) / 2) * scale, 82 + (y - (minY + maxY) / 2) * scale];
    const rings = stations.map(station => station.map(point => toCanvas(view(point))));

    function surface(points, fill, outline = false) {
      context.beginPath();
      for (const [x, y] of points) context.lineTo(x, y);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      if (outline) {
        context.lineWidth = 1.45;
        context.strokeStyle = '#233f35';
        context.stroke();
      }
    }

    for (let index = 1; index < rings.length; index += 1) {
      const previous = rings[index - 1];
      const next = rings[index];
      const angle = bendAngles[Math.min(index - 1, steps)];
      const lightness = 50 + 15 * Math.cos(angle - Math.PI - yaw);
      surface([previous[0], next[0], next[3], previous[3]], `hsl(151 25% ${lightness}%)`);
    }
    line(rings.map(ring => ring[0]), '#233f35', 1.45);
    const top = context.createLinearGradient(128, 30, 277, 126);
    top.addColorStop(0, '#f1f8f3');
    top.addColorStop(1, '#b7d4c4');
    surface([...rings.map(ring => ring[2]), ...rings.map(ring => ring[3]).reverse()], top, true);

    const rimInset = Math.min(width, ductHeight) * 0.054;
    for (const [angle, advance, ring] of [[startAngle, -endLength, rings[0]], [endAngle, endLength, rings.at(-1)]]) {
      surface(ring, '#bad6c6', true);
      const opening = sectionAt(angle, advance, rimInset).map(point => toCanvas(view(point)));
      surface(opening, '#355548', true);
    }

    const inletX = rings[0][1][0];
    const inletY = (rings[0][1][1] + rings[0][2][1]) / 2;
    line([[87, inletY], [inletX, inletY]]);
    label(inletSection, 81, inletY, 'right');

    const [radiusX, radiusY] = rings[1 + steps / 2][0];
    const calloutY = Math.min(154, radiusY + 25);
    line([[radiusX, radiusY], [radiusX + 23, calloutY], [313, calloutY]]);
    arrow(radiusX, radiusY, Math.atan2(radiusY - calloutY, -23));
    label(value('R', geometry.radius), 321, calloutY, 'left');
    label(`${elbowAngle}°`, 200, 167);
    return;
  }

  if (type === 'branch') {
    const point = (x, depth, z) => [54 + x - 0.65 * depth, 85 + 0.16 * x + 0.37 * depth - z];
    const mainLength = 238;
    const mainDepth = -74;
    const mainHeight = 45;
    const branchDepth = 38;
    const left = 91;
    const right = 193;
    const bottom = 5;
    const top = 41;
    const widthRatio = outletWidth ? Math.max(0.36, size.width / outletWidth) : 0.75;
    const heightRatio = outletHeight ? Math.max(0.36, size.height / outletHeight) : 1;
    const mouthLeft = right - (right - left) * widthRatio;
    const mouthTop = bottom + (top - bottom) * heightRatio;

    function face(vertices, fill) {
      context.beginPath();
      for (const vertex of vertices) context.lineTo(...point(...vertex));
      context.closePath();
      paintDuct(fill);
    }

    face([[0, 0, mainHeight], [mainLength, 0, mainHeight], [mainLength, mainDepth, mainHeight], [0, mainDepth, mainHeight]], '#eef4ef');
    face([[mainLength, 0, 0], [mainLength, mainDepth, 0], [mainLength, mainDepth, mainHeight], [mainLength, 0, mainHeight]], '#d2dfd6');
    face([[0, 0, 0], [mainLength, 0, 0], [mainLength, 0, mainHeight], [0, 0, mainHeight]], '#e5eee7');
    for (const station of [19, 218]) {
      for (const x of [station, station + 3]) {
        line([point(x, mainDepth, mainHeight), point(x, 0, mainHeight), point(x, 0, 0)], '#648578', 1);
      }
    }

    face([[left - 4, 0, bottom - 3], [right + 4, 0, bottom - 3], [right + 4, 0, top + 3], [left - 4, 0, top + 3]], '#a5c7b4');
    face([[left, 0, top], [right, 0, top], [right, branchDepth, mouthTop], [mouthLeft, branchDepth, mouthTop]], '#c5e0cf');
    face([[right, 0, bottom], [right, 0, top], [right, branchDepth, mouthTop], [right, branchDepth, bottom]], '#93c0a8');
    face([[mouthLeft - 3, branchDepth, bottom - 3], [right + 3, branchDepth, bottom - 3],
      [right + 3, branchDepth, mouthTop + 3], [mouthLeft - 3, branchDepth, mouthTop + 3]], '#b4d3c1');
    face([[mouthLeft + 2, branchDepth, bottom + 2], [right - 2, branchDepth, bottom + 2],
      [right - 2, branchDepth, mouthTop - 2], [mouthLeft + 2, branchDepth, mouthTop - 2]], '#466e5e');

    line([point(150, 0, top + 3), [241, 28], [267, 28]]);
    label(`본관 접속 ${outletSection}`, 268, 27, 'left');
    line([point(mouthLeft - 3, branchDepth, bottom), [118, 128], [109, 128]]);
    label(`분기측 ${inletSection}`, 102, 129, 'right');
    line([point(right + 4, 0, bottom), point(right + 23, 0, bottom)]);
    line([point(right + 3, branchDepth, bottom), point(right + 23, branchDepth, bottom)]);
    dimension(...point(right + 20, 0, bottom), ...point(right + 20, branchDepth, bottom));
    label(value('L', geometry.length), 281, 130, 'left');
    return;
  }

  if (type === 'reducer') {
    function profile(inletSize, outletSize, alignment, centerX, title, nearLabel, farLabel) {
      const left = centerX - 16;
      const right = centerX + 16;
      const largest = Math.max(inletSize, outletSize);
      const inletSpan = Math.max(6, 76 * inletSize / largest);
      const outletSpan = Math.max(6, 76 * outletSize / largest);
      const firstTop = -inletSpan / 2;
      const firstBottom = inletSpan / 2;
      let secondTop = -outletSpan / 2;
      if (alignment === 'top' || alignment === 'left') secondTop = firstTop;
      if (alignment === 'bottom' || alignment === 'right') secondTop = firstBottom - outletSpan;
      const secondBottom = secondTop + outletSpan;
      const baseline = 71 - (Math.min(firstTop, secondTop) + Math.max(firstBottom, secondBottom)) / 2;

      label(title, centerX, 16);
      context.beginPath();
      context.moveTo(left, firstTop + baseline);
      context.lineTo(right, secondTop + baseline);
      context.lineTo(right, secondBottom + baseline);
      context.lineTo(left, firstBottom + baseline);
      context.closePath();
      paintDuct();
      label(nearLabel, left - 9, baseline, 'right', 69);
      label(farLabel, right + 9, (secondTop + secondBottom) / 2 + baseline, 'left', 69);
    }

    profile(size.height || 300, positiveInteger(outletHeight) ? outletHeight : 150, level, 100, level ? `측면 · ${levelLabels[level]}` : '측면',
      value('B', size.height), value('D', outletHeight));
    profile(size.width || 450, positiveInteger(outletWidth) ? outletWidth : 225, side, 300, side ? `평면 · ${sideLabels[side]}` : '평면',
      value('A', size.width), value('C', outletWidth));
    line([[84, 114], [84, 128]]);
    line([[116, 114], [116, 128]]);
    dimension(84, 124, 116, 124);
    label(value('L', geometry.length), 100, 138);
    return;
  }

  const ductWidth = size.width || 500;
  const ductHeight = size.height || 300;
  const length = positiveInteger(geometry.length) ? geometry.length : 600;
  const rise = positiveInteger(geometry.rise) ? geometry.rise : 200;
  const verticalRatio = rise / (ductHeight + rise);
  const wallSpan = 13 + 45 * (1 - verticalRatio);
  const lift = 12 + 58 * verticalRatio;
  const lowTop = 74 + (lift - wallSpan) / 2;
  const highTop = lowTop - lift;
  const leftBottom = lowTop + wallSpan;
  const rightBottom = highTop + wallSpan;
  const left = 146;
  const span = 64 + 120 * length / (length + 650);
  const right = left + span;
  const riseLine = right + 19;
  const straightSpan = drawInlet ? span * Math.min(0.49, geometry.inlet / length) : 0;
  const knee = left + straightSpan;
  const endBend = geometry.equalEndStraights ? right - straightSpan : right;
  const bendSpan = endBend - knee;

  // The end view shows the rectangular section that is hidden in the side profile.
  const endViewScale = Math.min(58 / ductWidth, 43 / ductHeight);
  const endViewWidth = Math.max(4, ductWidth * endViewScale);
  const endViewHeight = Math.max(4, ductHeight * endViewScale);
  label('단면', 65, 31);
  context.beginPath();
  context.rect(65 - endViewWidth / 2, 70 - endViewHeight / 2, endViewWidth, endViewHeight);
  paintDuct();
  label(inletSection, 65, 105, 'center', 116);

  context.setLineDash([4, 3]);
  line([[left, leftBottom], [riseLine + 4, leftBottom]]);
  context.setLineDash([]);

  context.beginPath();
  context.moveTo(left, lowTop);
  if (drawInlet) {
    context.lineTo(knee, lowTop);
    context.bezierCurveTo(knee + bendSpan * 0.35, lowTop, endBend - bendSpan * 0.35, highTop, endBend, highTop);
  }
  context.lineTo(right, highTop);
  context.lineTo(right, rightBottom);
  if (drawInlet) {
    context.lineTo(endBend, rightBottom);
    context.bezierCurveTo(endBend - bendSpan * 0.35, rightBottom, knee + bendSpan * 0.35, leftBottom, knee, leftBottom);
  }
  context.lineTo(left, leftBottom);
  context.closePath();
  paintDuct();
  line([[left, lowTop - 4], [left, leftBottom + 4]], '#233f35', 1.35);
  line([[right, highTop - 4], [right, rightBottom + 4]], '#233f35', 1.35);
  line([[left, leftBottom + 7], [left, 139]]);
  line([[right, rightBottom + 7], [right, 139]]);
  dimension(left, 136, right, 136);
  label(value('L', geometry.length), (left + right) / 2, 150);
  line([[right, rightBottom], [riseLine + 4, rightBottom]]);
  dimension(riseLine, rightBottom, riseLine, leftBottom);
  label(value('H', geometry.rise), riseLine + 7, (rightBottom + leftBottom) / 2, 'left');
  if (drawInlet) {
    for (const [start, end, top] of [[left, knee, lowTop], [endBend, right, highTop]]) {
      if (start === end) continue;
      line([[start, top - 4], [start, top - 18]]);
      line([[end, top - 4], [end, top - 18]]);
      if (straightSpan >= 13) dimension(start, top - 15, end, top - 15);
      else line([[start, top - 15], [end, top - 15]]);
      label(value('C', geometry.inlet), (start + end) / 2, Math.max(10, top - 26));
    }
  }
}

function drawPartThumbnail(canvas, type, round = false) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(2, 0, 0, 2, 0, 0);
  context.clearRect(0, 0, 60, 28);
  context.lineJoin = 'round';
  if (orderCalculations.isDamper(type) || orderCalculations.isAirOutlet(type)) {
    context.save();
    if (orderCalculations.isDamper(type)) {
      context.translate(5, 1);
      context.scale(0.27, 0.27);
      drawDamperBody(context, type, round);
    } else {
      context.translate(15, 0);
      context.scale(0.28, 0.28);
      drawOutletFace(context, type);
    }
    context.restore();
    return;
  }
  context.beginPath();
  const angle = orderCalculations.elbowAngles[type];

  if (angle) {
    const bend = Math.PI + angle * Math.PI / 180;
    const cx = angle === 45 ? 43 : 40;
    context.arc(cx, 25, 23, Math.PI, bend);
    context.arc(cx, 25, 10, bend, Math.PI, true);
  } else if (type === 'offset') {
    context.moveTo(7, 15);
    context.lineTo(19, 15);
    context.bezierCurveTo(25, 15, 32, 5, 42, 5);
    context.lineTo(53, 5);
    context.lineTo(53, 14);
    context.lineTo(42, 14);
    context.bezierCurveTo(32, 14, 25, 24, 19, 24);
    context.lineTo(7, 24);
  } else {
    const outlines = {
      straight: [[7, 7], [53, 7], [53, 22], [7, 22]],
      reducer: [[24, 3], [34, 9], [34, 19], [24, 25]],
      branch: [[7, 5], [53, 5], [53, 16], [38, 16], [36, 23], [24, 23], [22, 16], [7, 16]],
      spiral: [[7, 8], [53, 8], [53, 21], [7, 21]],
      spiralTakeoff: [[9, 23], [17, 18], [17, 5], [43, 5], [43, 18], [51, 23]],
    };
    for (const [x, y] of outlines[type]) context.lineTo(x, y);
  }

  context.closePath();
  context.fillStyle = '#e1eee6';
  context.fill();
  context.strokeStyle = '#2f6250';
  context.lineWidth = 1.35;
  context.stroke();
  if (type === 'spiral') {
    context.beginPath();
    for (const x of [11, 22, 33, 44]) {
      context.moveTo(x, 21);
      context.lineTo(x + 8, 8);
    }
    context.stroke();
  }
}

function drawDamperBody(ctx, type, round = false) {
  const fire = type === 'fd' || type === 'mfd';
  const motor = type === 'mvd' || type === 'mfd';
  ctx.strokeStyle = '#294a3e';
  ctx.lineWidth = 2.6;

  function polygon(points, fill) {
    ctx.beginPath();
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  }

  function opening() {
    ctx.beginPath();
    if (round) ctx.ellipse(78, 61, 39, 29, 0, 0, Math.PI * 2);
    else ctx.rect(34, 30, 88, 62);
  }

  if (round) {
    ctx.beginPath();
    ctx.ellipse(126, 46, 39, 29, 0, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(78, 90);
    ctx.lineTo(78, 32);
    ctx.closePath();
    ctx.fillStyle = '#abcdb9';
    ctx.fill();
    ctx.stroke();
  } else {
    polygon([[34, 30], [82, 15], [170, 15], [122, 30]], '#e1efe5');
    polygon([[122, 30], [170, 15], [170, 77], [122, 92]], '#a8cbb7');
  }
  opening();
  ctx.fillStyle = '#e1efe6';
  ctx.fill();
  ctx.stroke();
  ctx.save();
  opening();
  ctx.clip();
  if (round) {
    ctx.beginPath();
    ctx.ellipse(78, 61, 37, fire ? 14 : 10, fire ? 0.28 : -0.27, 0, Math.PI * 2);
    ctx.fillStyle = fire ? '#93ae9b' : '#7aa58f';
    ctx.fill();
    ctx.stroke();
  } else {
    for (const y of [37, 53, 69, 85]) {
      ctx.fillStyle = fire ? '#94ab9c' : '#7ba790';
      ctx.fillRect(38, y - 3, 80, fire ? 8 : 5);
      ctx.strokeRect(38, y - 3, 80, fire ? 8 : 5);
    }
  }
  if (fire) polygon([[74, 52], [82, 52], [86, 61], [82, 70], [74, 70], [70, 61]], '#efd7a5');
  ctx.restore();

  if (motor) {
    polygon([[143, 61], [151, 58], [151, 76], [143, 79]], '#e3eee9');
    polygon([[150, 66], [167, 66], [167, 72], [150, 72]], '#607c71');
    polygon([[163, 55], [169, 50], [194, 50], [189, 55]], '#d6e2de');
    polygon([[189, 55], [194, 50], [194, 75], [189, 80]], '#5a7b70');
    polygon([[163, 55], [189, 55], [189, 80], [163, 80]], '#8aa99e');
    ctx.fillStyle = '#1a4336';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 176, 68);
  } else if (!fire) {
    ctx.beginPath();
    ctx.moveTo(146, 69);
    ctx.lineTo(160, 69);
    ctx.lineTo(164, 56);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawOutletFace(ctx, type) {
  const diffuser = orderCalculations.diffusers[type];
  ctx.fillStyle = '#dce7de';
  ctx.strokeStyle = '#2f6250';
  ctx.lineWidth = 2;
  if (diffuser) {
    const square = type === 'squareDiffuser';
    if (!diffuser.roundFace) {
      ctx.fillRect(6, 6, 108, 88);
      ctx.strokeRect(6, 6, 108, 88);
    }
    const radii = type === 'nozzleDiffuser' ? [44, 35, 15] : [44, 33, 23, 11];
    for (const [index, radius] of radii.entries()) {
      ctx.fillStyle = index % 2 ? '#c0d5c7' : '#eef5ef';
      ctx.beginPath();
      if (square) ctx.rect(60 - radius, 50 - radius * 0.83, radius * 2, radius * 1.66);
      else ctx.arc(60, 50, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    return;
  }
  ctx.fillRect(6, 6, 108, 88);
  ctx.strokeRect(6, 6, 108, 88);
  ctx.fillStyle = '#eef5ef';
  ctx.fillRect(16, 16, 88, 68);
  ctx.strokeRect(16, 16, 88, 68);
  if (type === 'louver') {
    for (let y = 19; y < 80; y += 13) {
      ctx.fillStyle = '#76928a';
      ctx.fillRect(17, y, 86, 7);
      ctx.fillStyle = '#a8bdb2';
      ctx.fillRect(17, y + 7, 86, 3);
    }
    return;
  }
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  for (let x = 25; x < 104; x += 9) {
    ctx.moveTo(x, 17);
    ctx.lineTo(x, 84);
  }
  for (let y = 24; y < 84; y += 8) {
    ctx.moveTo(17, y);
    ctx.lineTo(104, y);
  }
  ctx.stroke();
  if (type === 'register') {
    ctx.fillStyle = '#355d54';
    ctx.fillRect(91, 58, 8, 20);
  }
}
