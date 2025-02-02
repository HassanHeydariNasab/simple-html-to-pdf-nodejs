import { readFileSync } from "fs";
import { join } from "path";

import { jsPDF } from "jspdf";
import "jspdf-autotable";

/** @import {CellDef, RowInput} from 'jspdf-autotable' */
import { JSDOM } from "jsdom";

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

const tagNameToFontSize = {
  H1: 20,
  H2: 18,
  H3: 16,
  H4: 14,
  H5: 12,
  H6: 10,
  P: 10,
};

const GAP = 20;

/**
 * @param {DOMWindow} win
 * @param {Element} element
 * @param {string} content
 * @param {number} order
 * @returns {CellDef}
 */
const constructCell = ({ win, element, content, order }) => {
  /** @type {CSSStyleDeclaration} */
  const style = win.getComputedStyle(element);

  console.log(element.tagName, { style });

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
      if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(element.tagName)) {
        cellPadding[key] = key === "top" || key === "bottom" ? 10 : 5;
        cellStyles.fontSize = tagNameToFontSize[element.tagName] ?? 10;
        cellStyles.fontStyle = "";
        //cellStyles.fontStyle = style.fontWeight === "bold" ? "bold" : "normal";
      } else {
        cellPadding[key] = 5;
      }
    }
  }

  cellStyles.cellPadding = cellPadding;

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

  let inlineContent = "";
  // Mark nodes as met while going back to the root
  while (true) {
    // parent node
    if (node.hasChildNodes()) {
      node = node.firstChild;
      continue;
    }

    // leaf node

    let display = "inline";

    /** @type {CSSStyleDeclaration} */
    let computedStyle = {};

    if (node.nodeType === 1) {
      computedStyle = win.getComputedStyle(node);
      display = computedStyle.display || "inline";
    }

    if (
      (node.nodeType === 1 && display.startsWith("inline")) ||
      node.nodeType === 3
    ) {
      // inline
      inlineContent += node.textContent.trim().length
        ? node.textContent.trim() + " "
        : "";
      if (!node.nextSibling && inlineContent) {
        tableBody.push([
          constructCell({
            content: inlineContent,
            element: node.nodeType === 3 ? node.parentElement : node,
            computedStyle,
            win,
            order: 0,
          }),
        ]);

        inlineContent = "";
      }
    } else {
      // block
      if (inlineContent) {
        // flush inline content
        tableBody.push([{ content: inlineContent.trim() }]);
        inlineContent = "";
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
    <body>
      <h1>Heading1</h1>
      <p>This is a sample paragraph.</p>
      <h2 style="color: red">Heading2</h2>
      <p>This is another sample paragraph with <b>bold</b> word.</p>
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
