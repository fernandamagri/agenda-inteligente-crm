// Conversor mínimo y seguro de Markdown a HTML para las respuestas del asistente.
// Primero escapa todo el HTML y después aplica un subconjunto de Markdown:
// negritas, cursivas, código, listas, tablas, citas, títulos y separadores.
(function () {
  const escapar = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function enLinea(texto) {
    return escapar(texto)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  }

  const celdas = (linea) => linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const esSeparadorTabla = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

  function convertir(md) {
    const lineas = String(md).replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;

    while (i < lineas.length) {
      const l = lineas[i];

      if (!l.trim()) { i++; continue; }

      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { html.push('<hr>'); i++; continue; }

      const titulo = l.match(/^(#{1,6})\s+(.*)$/);
      if (titulo) {
        const nivel = Math.min(6, titulo[1].length + 2); // títulos discretos dentro del chat
        html.push(`<h${nivel}>${enLinea(titulo[2])}</h${nivel}>`);
        i++; continue;
      }

      // Tabla: fila de encabezado + separador
      if (l.includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
        const cab = celdas(l);
        i += 2;
        const filas = [];
        while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim()) filas.push(celdas(lineas[i++]));
        html.push(
          '<div class="tabla-md"><table><thead><tr>' +
            cab.map((c) => `<th>${enLinea(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            filas.map((f) => '<tr>' + f.map((c) => `<td>${enLinea(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table></div>'
        );
        continue;
      }

      if (/^\s*>/.test(l)) {
        const bloque = [];
        while (i < lineas.length && /^\s*>/.test(lineas[i])) bloque.push(lineas[i++].replace(/^\s*>\s?/, ''));
        html.push(`<blockquote>${convertir(bloque.join('\n'))}</blockquote>`);
        continue;
      }

      const esOrdenada = (s) => /^\s*\d+[.)]\s+/.test(s);
      const esVineta = (s) => /^\s*[-*•]\s+/.test(s);
      if (esOrdenada(l) || esVineta(l)) {
        const ordenada = esOrdenada(l);
        const items = [];
        while (i < lineas.length) {
          const actual = lineas[i];
          if (ordenada ? esOrdenada(actual) : esVineta(actual)) {
            items.push([actual.replace(ordenada ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, '')]);
            i++;
          } else if (/^\s{2,}\S/.test(actual) && items.length) {
            items[items.length - 1].push(actual.trim()); // continuación o sub-ítem
            i++;
          } else break;
        }
        const tag = ordenada ? 'ol' : 'ul';
        html.push(
          `<${tag}>` +
            items
              .map(([primera, ...resto]) => {
                const sub = resto.length ? convertir(resto.join('\n')) : '';
                return `<li>${enLinea(primera)}${sub}</li>`;
              })
              .join('') +
            `</${tag}>`
        );
        continue;
      }

      const parrafo = [];
      while (
        i < lineas.length && lineas[i].trim() &&
        !/^(#{1,6}\s|\s*>|\s*\d+[.)]\s|\s*[-*•]\s)/.test(lineas[i]) &&
        !(lineas[i].includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1]))
      ) parrafo.push(enLinea(lineas[i++]));
      html.push(`<p>${parrafo.join('<br>')}</p>`);
    }
    return html.join('');
  }

  window.markdownAHtml = convertir;
})();
