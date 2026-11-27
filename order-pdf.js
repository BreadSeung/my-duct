'use strict';

const orderPdf = (() => {
  const pageWidth = 794;
  const pageHeight = 1123;
  const scale = 2;
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const columnWidths = [43, 100, 195, 43, 52, 273];
  const diagramWidth = 340;
  const colors = { ink: '#172c24', brand: '#255440', muted: '#4d6157', line: '#aebbb1', tint: '#e8f0e9',
    warning: '#824313', warningTint: '#f7eee1' };
  const fontFamily = 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

  function wrap(ctx, text, width) {
    const lines = [];
    let line = '';
    for (const word of text.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function textStyle(ctx, size, bold = false, color = colors.ink) {
    ctx.font = `${bold ? 700 : 400} ${size}px ${fontFamily}`;
    ctx.fillStyle = color;
  }

  function cellLines(ctx, cell, width) {
    const parts = cell.children.length ? Array.from(cell.children) : [cell];
    return parts.flatMap(part => {
      const small = part.tagName === 'SMALL';
      const bold = part.tagName === 'STRONG' || part.tagName === 'TH';
      const size = small ? 11 : 12;
      const color = part.classList.contains('unconfirmed') ? colors.warning : small ? colors.muted : colors.ink;
      textStyle(ctx, size, bold, color);
      return wrap(ctx, part.textContent, width).map(text => ({ text, size, bold, color }));
    });
  }

  function drawRow(ctx, columns, top, height, heading = false) {
    let x = margin;
    for (const [index, lines] of columns.entries()) {
      const width = columnWidths[index];
      if (heading) {
        ctx.fillStyle = colors.tint;
        ctx.fillRect(x, top, width, height);
      }
      ctx.strokeStyle = colors.line;
      ctx.strokeRect(x, top, width, height);
      ctx.textAlign = [0, 3, 4].includes(index) ? 'center' : 'left';
      const textX = ctx.textAlign === 'center' ? x + width / 2 : x + 7;
      for (const [n, line] of lines.entries()) {
        textStyle(ctx, line.size, line.bold, line.color);
        ctx.fillText(line.text, textX, top + 7 + n * 17);
      }
      x += width;
    }
    ctx.textAlign = 'left';
  }

  function drawInfo(ctx, entries, top) {
    const width = contentWidth / 2;
    const labelWidth = 96;
    for (let index = 0; index < entries.length; index += 2) {
      const pair = entries.slice(index, index + 2).map(([label, value]) => {
        textStyle(ctx, 13);
        return { label, lines: wrap(ctx, value, width - labelWidth - 16) };
      });
      const height = 13 + 18 * Math.max(1, ...pair.map(entry => entry.lines.length));
      for (const [column, { label, lines }] of pair.entries()) {
        const x = margin + column * width;
        ctx.fillStyle = colors.tint;
        ctx.fillRect(x, top, labelWidth, height);
        ctx.strokeStyle = colors.line;
        ctx.strokeRect(x, top, width, height);
        textStyle(ctx, 12, true);
        ctx.fillText(label, x + 8, top + 8);
        textStyle(ctx, 13);
        for (const [n, line] of lines.entries()) ctx.fillText(line, x + labelWidth + 8, top + 7 + n * 18);
      }
      top += height;
    }
    return top;
  }

  function jpeg(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob?.type === 'image/jpeg') resolve(blob);
        else reject(new Error('PDF 페이지 이미지 생성 실패'));
      }, 'image/jpeg', 0.89);
    });
  }

  // Assemble an A4 PDF from JPEG pages so Korean glyphs travel with the file.
  function pdfBlob(images, pixelWidth, pixelHeight) {
    const parts = [];
    const offsets = [0];
    let position = 0;
    function append(part) {
      parts.push(part);
      // Syntax strings contain ASCII only. Stream lengths use the actual Blob bytes.
      position += typeof part === 'string' ? part.length : part.size;
    }
    function object(body, stream) {
      offsets.push(position);
      append(`${offsets.length - 1} 0 obj\n${body}\n`);
      if (stream) {
        append('stream\n');
        append(stream);
        append('\nendstream\n');
      }
      append('endobj\n');
    }

    append('%PDF-1.4\n');
    object('<< /Type /Catalog /Pages 2 0 R >>');
    object(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] >>`);
    for (const [index, image] of images.entries()) {
      const page = 3 + index * 3;
      const contents = 'q\n595.28 0 0 841.89 0 0 cm\n/Sheet Do\nQ\n';
      object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Sheet ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
      object(`<< /Length ${contents.length} >>`, contents);
      object(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.size} >>`, image);
    }
    const xref = position;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`);
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  async function create(sheet) {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('PDF용 캔버스를 사용할 수 없습니다.');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'top';

    const table = sheet.querySelector('table');
    const headings = Array.from(table.tHead.rows[0].cells, (cell, index) => cellLines(ctx, cell, columnWidths[index] - 14));
    const rows = Array.from(table.querySelectorAll('tbody > tr:not(.order-offset-diagram)'));
    const info = Array.from(sheet.querySelector('.print-info').children, row => Array.from(row.children, cell => cell.textContent));
    const title = sheet.querySelector('h1').textContent;
    const brand = sheet.querySelector('.print-brand').textContent;
    const status = sheet.querySelector('.print-status')?.textContent;
    const total = sheet.querySelector('.print-total').textContent;
    const images = [];

    function startPage() {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, pageWidth, pageHeight);
      textStyle(ctx, 14, true, colors.brand);
      ctx.fillText(brand, margin, margin);
      textStyle(ctx, 31, true);
      ctx.fillText(title, margin, margin + 22);
      if (status) {
        textStyle(ctx, 12, true, colors.warning);
        const width = ctx.measureText(status).width + 20;
        const x = pageWidth - margin - width;
        ctx.fillStyle = colors.warningTint;
        ctx.fillRect(x, margin + 28, width, 25);
        ctx.fillStyle = colors.warning;
        ctx.fillText(status, x + 10, margin + 34);
      }
      ctx.fillStyle = colors.brand;
      ctx.fillRect(margin, margin + 66, contentWidth, 2);
      const tableTop = images.length ? margin + 84 : drawInfo(ctx, info, margin + 85) + 22;
      drawRow(ctx, headings, tableTop, 32, true);
      return tableTop + 32;
    }

    async function finishPage() {
      textStyle(ctx, 11, false, colors.muted);
      ctx.textAlign = 'right';
      ctx.fillText(String(images.length + 1), pageWidth - margin, pageHeight - 39);
      ctx.textAlign = 'left';
      images.push(await jpeg(canvas));
    }

    let top = startPage();
    for (const [index, row] of rows.entries()) {
      const columns = Array.from(row.cells, (cell, column) => cellLines(ctx, cell, columnWidths[column] - 14));
      const height = 14 + 17 * Math.max(1, ...columns.map(lines => lines.length));
      const diagram = row.nextElementSibling?.querySelector('canvas');
      const diagramHeight = diagram ? (diagram.height / diagram.width) * diagramWidth + 12 : 0;
      const totalHeight = index === rows.length - 1 ? 31 : 0;
      if (top + height + diagramHeight + totalHeight > pageHeight - 63) {
        await finishPage();
        top = startPage();
      }
      drawRow(ctx, columns, top, height);
      top += height;
      if (diagram) {
        ctx.strokeStyle = colors.line;
        ctx.strokeRect(margin, top, contentWidth, diagramHeight);
        ctx.drawImage(diagram, margin + (contentWidth - diagramWidth) / 2, top + 6, diagramWidth, diagramHeight - 12);
        top += diagramHeight;
      }
    }

    textStyle(ctx, 14, true, colors.brand);
    ctx.textAlign = 'right';
    ctx.fillText(total, pageWidth - margin, top + 15);
    ctx.textAlign = 'left';
    await finishPage();
    const result = pdfBlob(images, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    return result;
  }

  return { create };
})();
