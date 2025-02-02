import { JSDOM } from "jsdom";
import { jsPDF } from "jspdf";

import { DocHandler } from './documentHandler'
import { Pos, Table } from './models'
import { Color, MarginPaddingInput, Styles } from './config'

/**
 * Get the width of the widest line in the text
 * Get the width of the widest line in the text
 * @param {string|string[]} text
 * @param {Partial<Styles>} styles
 * @param {jsPDF} doc
 */
export function getStringWidth(
  text,
  styles,
  doc
) {
  doc.applyStyles(styles, true)

  const textArr = Array.isArray(text) ? text : [text]

  const widestLineWidth = textArr
    .map((text) => doc.getTextWidth(text))
    .reduce((a, b) => Math.max(a, b), 0)

  return widestLineWidth
}


export type MarginPadding = {
  top: number
  right: number
  bottom: number
  left: number
}

export function parseSpacing(
  value: MarginPaddingInput | undefined,
  defaultValue: number,
): MarginPadding {
  value = value || defaultValue
  if (Array.isArray(value)) {
    if (value.length >= 4) {
      return {
        top: value[0],
        right: value[1],
        bottom: value[2],
        left: value[3],
      }
    } else if (value.length === 3) {
      return {
        top: value[0],
        right: value[1],
        bottom: value[2],
        left: value[1],
      }
    } else if (value.length === 2) {
      return {
        top: value[0],
        right: value[1],
        bottom: value[0],
        left: value[1],
      }
    } else if (value.length === 1) {
      value = value[0]
    } else {
      value = defaultValue
    }
  }

  if (typeof value === 'object') {
    if (typeof value.vertical === 'number') {
      value.top = value.vertical
      value.bottom = value.vertical
    }
    if (typeof value.horizontal === 'number') {
      value.right = value.horizontal
      value.left = value.horizontal
    }
    return {
      left: value.left ?? defaultValue,
      top: value.top ?? defaultValue,
      right: value.right ?? defaultValue,
      bottom: value.bottom ?? defaultValue,
    }
  }

  if (typeof value !== 'number') {
    value = defaultValue
  }

  return { top: value, right: value, bottom: value, left: value }
}

export function getPageAvailableWidth(doc: DocHandler, table: Table) {
  const margins = parseSpacing(table.settings.margin, 0)
  return doc.pageSize().width - (margins.left + margins.right)
}
