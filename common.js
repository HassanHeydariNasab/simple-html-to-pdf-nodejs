import { jsPDF } from "jspdf";

/**
 * Get the width of the widest line in the text
 * Get the width of the widest line in the text
 * @param {string|string[]} text
 * @param {Partial<Styles>} styles
 * @param {jsPDF} doc
 */
export function getStringWidth(text, styles, doc) {
  doc.applyStyles(styles, true);

  const textArr = Array.isArray(text) ? text : [text];

  const widestLineWidth = textArr
    .map((text) => doc.getTextWidth(text))
    .reduce((a, b) => Math.max(a, b), 0);

  return widestLineWidth;
}

/**
@type {{ top: number right: number bottom: number left: number }} MarginPadding
*/

/**
@param {string} value
@returns {MarginPadding}
*/
export function parseSpacing(value) {
  const items = value.split(/\s+/);
  if (items.length >= 4) {
    return {
      top: items[0],
      right: items[1],
      bottom: items[2],
      left: items[3],
    };
  } else if (items.length === 3) {
    return {
      top: items[0],
      right: items[1],
      bottom: items[2],
      left: items[1],
    };
  } else if (items.length === 2) {
    return {
      top: items[0],
      right: items[1],
      bottom: items[0],
      left: items[1],
    };
  } else if (items.length === 1) {
    return {
      top: items[0],
      right: items[0],
      bottom: items[0],
      left: items[0],
    };
  } else {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
  }
}

export function getPageAvailableWidth(doc, margins) {
  const margins = parseSpacing(table.settings.margin, 0);
  return doc.pageSize().width - (margins.left + margins.right);
}
