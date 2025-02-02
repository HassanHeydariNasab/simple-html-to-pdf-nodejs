import { readFileSync } from "fs";
import { join } from "path";

import { jsPDF } from "jspdf";
import "jspdf-autotable";

/** @import {CellDef, RowInput} from 'jspdf-autotable' */
import { JSDOM } from "jsdom";

import { GAP, NODE_TYPE, tagNameToFontSize } from "./constants.mjs";

const globalFontRegular = readFileSync(
  join("static/fonts/GoNotoKurrent-Regular.ttf"),
  {
    encoding: "latin1",
  },
);

/**
 * @param {string} html
 * @returns {jsPDF}
 */
export function generatePdf(html) {
  const pdf = new jsPDF();

  pdf.addFileToVFS("GoNotoKurrent-Regular.ttf", globalFontRegular);
  pdf.addFont("GoNotoKurrent-Regular.ttf", "GoNotoKurrentRegular", "normal");

  pdf.setFont("GoNotoKurrentRegular");

  insertHtmlToPdf({
    pdf,
    html,
  });

  pdf.save("./output/a4.pdf");
}

/**
 * @param {DOMWindow} win
 * @param {Node[]} nodes
 * @returns {CellDef}
 */
const constructCell = ({ win, nodes }) => {
  /** @type {CSSStyleDeclaration} */
  const style = win.getComputedStyle(element);

  /**
   * @type {CellDef['styles']}
   */
  const cellStyles = {};

  const cellPadding = {
    left: +style.paddingLeft.match(/(\d+)(\w+)/)?.[1],
    right: +style.paddingRight.match(/(\d+)(\w+)/)?.[1],
    top: +style.paddingTop.match(/(\d+)(\w+)/)?.[1],
    bottom: +style.paddingBottom.match(/(\d+)(\w+)/)?.[1],
  };

  for (const key in cellPadding) {
    if (cellPadding[key] !== 0 && !cellPadding[key]) {
      cellPadding[key] = key === "top" || key === "bottom" ? 10 : 5;
    }
  }
  cellStyles.cellPadding = cellPadding;

  cellStyles.fontSize = tagNameToFontSize[element.tagName] ?? 10;
  cellStyles.fontStyle = style.fontWeight || "normal";

  switch (element.tagName) {
    case "P": {
      content = "    " + content;
      break;
    }
    case "LI": {
      if (element.parentElement?.tagName === "OL") {
        content = `${[].indexOf.call(element.parentNode.children, element) + 1}. ${content}`;
      } else {
        content = `  • ${content}`;
      }
    }
  }

  return {
    content,
    styles: cellStyles,
  };
};

/**
 * @param {jsPDF} pdf
 * @param {string} html
 * @param {number|undefined} firstPagePaddingTop
 * @param {number|undefined} pagePadding
 * @param {number|undefined} gap
 * @returns {Object} result
 * @returns {number} result.finalY
 */

export const insertHtmlToPdf = ({
  pdf,
  html,
  firstPagePaddingTop = 0,
  pagePadding,
  gap = GAP,
}) => {
  const W = pdf.internal.pageSize.getWidth();

  const win = new JSDOM(html.replaceAll("\n", "")).window;
  const doc = win.document;

  if (pagePadding === undefined) {
    pagePadding = W * 0.05;
  }

  /** @type RowInput[] */
  const tableBody = [];

  /** @type Node */
  let node = doc.body;

  /** @type Node[] */
  let inlineNodes = [];

  while (true) {
    console.log(node.nodeName);

    // root node
    if (node.hasChildNodes()) {
      node = node.firstChild;
      continue;
    }

    // leaf node

    let display = "inline";

    /** @type {CSSStyleDeclaration} */
    let computedStyle = {};

    if (node.nodeType === NODE_TYPE.ELEMENT_NODE) {
      computedStyle = win.getComputedStyle(node);
      display = computedStyle.display || "inline";
    }

    if (
      (node.nodeType === NODE_TYPE.ELEMENT_NODE &&
        display.startsWith("inline")) ||
      node.nodeType === NODE_TYPE.TEXT_NODE
    ) {
      // inline
      inlineNodes.push(node);

      if (!node.nextSibling && inlineNodes.length) {
        tableBody.push([
          constructCell({
            nodes: inlineNodes,
            win,
          }),
        ]);

        inlineNodes = "";
      }
    } else if (
      node.nodeType === NODE_TYPE.ELEMENT_NODE &&
      !display.startsWith("inline")
    ) {
      // block
      if (inlineNodes) {
        // flush inline content
        tableBody.push([{ content: inlineNodes.trim() }]);
        inlineNodes = "";
      }
      // block content
      tableBody.push([
        constructCell({
          element: node,
          content: node.textContent.trim(),
          computedStyle: win.getComputedStyle(node.parentElement),
          win,
          order: 0,
        }),
      ]);
    } else {
      throw new Error("Unknown node type");
    }

    if (node.nextSibling) {
      node = node.nextSibling;
    } else if (node.parentNode.nextSibling) {
      node = node.parentNode.nextSibling;
    } else {
      break;
    }
  }

  pdf.autoTable({
    head: [[""]],
    body: tableBody,
    theme: "plain",
    styles: {
      font: "GoNotoKurrentRegular",
      fontStyle: "normal",
      overflow: "linebreak",
      cellWidth: "auto",
      cellPadding: 5,
    },

    didParseCell(data) {
      data.cell.styles.valign = "middle";
      data.cell.styles.cellWidth = "auto";
    },

    startY: firstPagePaddingTop,
    margin: pagePadding,
    pageBreak: "auto",
    rowPageBreak: "avoid",
    horizontalPageBreakBehaviour: "immediately",
    horizontalPageBreak: false,
    horizontalPageBreakRepeat: 0,
  });

  return { finalY: pdf["lastAutoTable"].finalY };
};

generatePdf(
  /* HTML */ `<html>
    <head></head>
    <body>
      <h1>Heading1</h1>
      <p>This is a sample paragraph.</p>
      <h2 style="color: red">Heading2</h2>
      <p>This is another <b>sample</b> paragraph with <b>bold</b> word.</p>
    </body>
  </html>`,
);

// generatePdf(
//   /* HTML */ `<html>
//     <body>
//       <h1>Heading1</h1>
//       <p>This is a sample paragraph.</p>
//       <h2>Heading2</h2>
//       <p>This is another sample paragraph with <b>bold</b> word.</p>
//       <ol>
//         <li>item 1</li>
//         <li>item 2</li>
//         <li>item 3</li>
//       </ol>
//       <ul>
//         <li>unordered item 1</li>
//         <li>unordered item 2</li>
//         <li>unordered item 3</li>
//       </ul>
//     </body>
//   </html>`,
// );
