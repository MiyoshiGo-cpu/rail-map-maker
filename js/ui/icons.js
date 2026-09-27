// UI のアイコン（24×24 の線画）
import { svgPath } from './dom.js';

/** @type {Record<string, string>} */
const PATHS = {
  menu: 'M4 6h16|M4 12h16|M4 18h16',
  more: 'M5 12h.01|M12 12h.01|M19 12h.01',
  undo: 'M9 14L4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5|M20 9H10a6 6 0 0 0 0 12h3',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5',
  select: 'M5 3l14 8-6 2-3 6z',
  station: 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  line: 'M3 19l6-6h5l7-7|M9 13m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  delete: 'M4 7h16|M10 11v6|M14 11v6|M6 7l1 13h10l1-13|M9 7V4h6v3',
  data: 'M4 5h16v14H4z|M4 10h16|M4 15h16|M10 5v14',
  check: 'M12 3l9 16H3z|M12 10v4|M12 17h.01',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0|M21 21l-5-5',
  close: 'M6 6l12 12|M18 6L6 18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  export: 'M12 3v12|M7 8l5-5 5 5|M5 15v5h14v-5',
  import: 'M12 15V3|M7 10l5 5 5-5|M5 15v5h14v-5',
  settings: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0|M12 2v3|M12 19v3|M2 12h3|M19 12h3|M4.9 4.9l2.1 2.1|M17 17l2.1 2.1|M4.9 19.1L7 17|M17 7l2.1-2.1',
  help: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0|M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5|M12 17h.01',
  grip: 'M9 6h.01|M15 6h.01|M9 12h.01|M15 12h.01|M9 18h.01|M15 18h.01',
  arrowUp: 'M12 19V5|M6 11l6-6 6 6',
  arrowDown: 'M12 5v14|M6 13l6 6 6-6',
  copy: 'M9 9h11v11H9z|M5 15H4V4h11v1',
  range: 'M4 4h4|M4 4v4|M20 4h-4|M20 4v4|M4 20h4|M4 20v-4|M20 20h-4|M20 20v-4',
  back: 'M15 6l-6 6 6 6',
  interchange: 'M7 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0|M17 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0|M10 12h4',
  layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5',
};

/**
 * @param {keyof typeof PATHS | string} name
 * @returns {SVGSVGElement}
 */
export function icon(name) {
  return /** @type {SVGSVGElement} */ (svgPath(PATHS[name] || PATHS.help));
}
