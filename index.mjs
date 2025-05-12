import { readFileSync } from "fs";
import { join } from "path";
import { jsPDF } from "jspdf";
import { JSDOM } from "jsdom";
import juice from "juice";

import { GAP, NODE_TYPE, tagNameToFontSize } from "./constants.mjs";

/** @import {CellDef, RowInput, UserOptions} from 'jspdf-autotable' */
/** @import {DOMWindow} from 'jsdom' */

const globalFontRegular = readFileSync(
  join("static", "fonts", "GoNotoKurrent-Regular.ttf"),
  {
    encoding: "latin1",
  }
);

const globalFontBold = readFileSync(
  join("static", "fonts", "GoNotoKurrent-Bold.ttf"),
  {
    encoding: "latin1",
  }
);

/**
 * @typedef {Object} LayoutOptions
 * @property {number} [pagePadding=20] - Padding around the page content
 * @property {number} [lineHeight=1.2] - Line height multiplier
 * @property {number} [paragraphSpacing=10] - Space between paragraphs
 * @property {boolean} [debug=false] - Draw debug boxes around elements
 * @property {string} [defaultFont='GoNotoKurrentRegular'] - Default font to use
 */

/**
 * @typedef {Object} TextMetrics
 * @property {number} width - Width of the text
 * @property {number} height - Height of the text
 */

/**
 * Calculate text metrics for a given text and style
 * @param {jsPDF} pdf - The PDF document
 * @param {string} text - The text to measure
 * @param {Object} style - Text style properties
 * @returns {TextMetrics} Text metrics
 */
const getTextMetrics = (pdf, text, style) => {
  const fontSize = parseInt(style.fontSize) || 10;
  pdf.setFontSize(fontSize);
  if (style.fontWeight === "bold") {
    pdf.setFont("GoNotoKurrentBold", "bold");
  } else {
    pdf.setFont("GoNotoKurrentRegular", "normal");
  }
  const width = pdf.getTextWidth(text);
  const height = fontSize * 1.2; // Approximate line height
  return { width, height };
};

/**
 * Render text with proper styling
 * @param {jsPDF} pdf - The PDF document
 * @param {string} text - The text to render
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} style - Text style properties
 */
const renderText = (pdf, text, x, y, style) => {
  const fontSize = parseInt(style.fontSize) || 10;
  const color = style.color || "black";
  pdf.setFontSize(fontSize);
  if (style.fontWeight === "bold") {
    pdf.setFont("GoNotoKurrentBold", "bold");
  } else {
    pdf.setFont("GoNotoKurrentRegular", "normal");
  }
  pdf.setTextColor(color);
  pdf.text(text, x, y);
};

/**
 * Get color value from CSS style
 * @param {string} color - CSS color value
 * @returns {number[]} Color values for jsPDF (0-255)
 */
const parseColor = (color) => {
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return [0, 0, 0]; // Black
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(
    /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

    // If fully transparent, return white
    if (a === 0) {
      return [255, 255, 255];
    }

    // Handle semi-transparency by blending with white background
    if (a < 1) {
      return [
        Math.round(r * a + 255 * (1 - a)),
        Math.round(g * a + 255 * (1 - a)),
        Math.round(b * a + 255 * (1 - a)),
      ];
    }

    return [r, g, b];
  }

  // Handle hex values
  if (color.startsWith("#")) {
    const hex = color.substring(1);
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return [r, g, b];
  }

  // Handle named colors
  const namedColors = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    gray: [128, 128, 128],
    purple: [128, 0, 128],
    orange: [255, 165, 0],
  };

  return namedColors[color.toLowerCase()] || [0, 0, 0];
};

/**
 * Apply color to PDF context
 * @param {jsPDF} pdf - PDF document
 * @param {string} color - CSS color value
 * @param {string} type - Type of color ('fill' or 'text')
 */
const applyColor = (pdf, color, type = "text") => {
  const [r, g, b] = parseColor(color);
  if (type === "text") {
    pdf.setTextColor(r, g, b);
  } else if (type === "fill") {
    pdf.setFillColor(r, g, b);
  }
};

/**
 * Parse CSS font weight to PDF font style
 * @param {string} fontWeight - CSS font weight
 * @param {string} fontStyle - CSS font style
 * @returns {string} PDF font style
 */
const parseFontStyle = (fontWeight, fontStyle) => {
  let style = "normal";

  if (
    fontWeight === "bold" ||
    fontWeight === "bolder" ||
    parseInt(fontWeight) >= 700
  ) {
    style = "bold";
  }

  if (fontStyle === "italic" || fontStyle === "oblique") {
    style = style === "bold" ? "bolditalic" : "italic";
  }

  return style;
};

/**
 * Get text dimensions
 * @param {jsPDF} pdf - PDF document
 * @param {string} text - Text to measure
 * @param {Object} style - Text style
 * @param {string} [tagName] - HTML tag name for fallback font size
 * @returns {Object} Text dimensions
 */
const getTextDimensions = (pdf, text, style, tagName = "P") => {
  // Get font size from style, or use tag default, or fallback to 12
  let fontSize =
    parseInt(style.fontSize) ||
    (tagName && tagNameToFontSize[tagName.toUpperCase()]) ||
    tagNameToFontSize.P ||
    12;

  // Ensure minimum font size
  fontSize = Math.max(fontSize, 8);

  const fontStyle = parseFontStyle(style.fontWeight, style.fontStyle);

  pdf.setFontSize(fontSize);
  if (fontStyle === "bold") {
    pdf.setFont(style.fontFamily || "GoNotoKurrentBold", "bold");
  } else {
    pdf.setFont(style.fontFamily || "GoNotoKurrentRegular", "normal");
  }

  const textWidth = pdf.getTextWidth(text);
  const lineHeight = fontSize * (parseFloat(style.lineHeight) || 1.2);
  const textHeight = lineHeight / pdf.internal.scaleFactor;

  return { width: textWidth, height: textHeight };
};

/**
 * Calculate element dimensions including borders, padding, etc.
 * @param {Element} element - DOM element
 * @param {CSSStyleDeclaration} style - Computed style
 * @param {number} contentWidth - Width of content area
 * @returns {Object} Element dimensions
 */
const getElementDimensions = (element, style, contentWidth) => {
  const display = style.display;
  const isBlock =
    display === "block" ||
    display === "flex" ||
    display === "grid" ||
    display === "table";

  // Parse numeric values
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;

  const marginTop = parseFloat(style.marginTop) || 0;
  const marginRight = parseFloat(style.marginRight) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  const marginLeft = parseFloat(style.marginLeft) || 0;

  const borderTopWidth = parseFloat(style.borderTopWidth) || 0;
  const borderRightWidth = parseFloat(style.borderRightWidth) || 0;
  const borderBottomWidth = parseFloat(style.borderBottomWidth) || 0;
  const borderLeftWidth = parseFloat(style.borderLeftWidth) || 0;

  // Calculate inner width (for block elements)
  const innerWidth = isBlock ? contentWidth - marginLeft - marginRight : null;

  return {
    isBlock,
    padding: {
      top: paddingTop,
      right: paddingRight,
      bottom: paddingBottom,
      left: paddingLeft,
    },
    margin: {
      top: marginTop,
      right: marginRight,
      bottom: marginBottom,
      left: marginLeft,
    },
    border: {
      top: borderTopWidth,
      right: borderRightWidth,
      bottom: borderBottomWidth,
      left: borderLeftWidth,
    },
    innerWidth,
  };
};

/**
 * Render a text node with proper wrapping
 * @param {jsPDF} pdf - PDF document
 * @param {string} text - Text content
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} style - Text style
 * @param {number} maxWidth - Maximum width
 * @param {string} [tagName] - HTML tag name for fallback font size
 * @returns {number} New Y position after rendering
 */
const renderTextNode = (pdf, text, x, y, style, maxWidth, tagName = "P") => {
  if (!text.trim()) return y;

  let fontSize =
    parseInt(style.fontSize) ||
    (tagName && tagNameToFontSize[tagName.toUpperCase()]) ||
    tagNameToFontSize.P ||
    12;

  fontSize = Math.max(fontSize, 8);

  const lineHeight = fontSize * (parseFloat(style.lineHeight) || 1.2);
  const fontStyle = parseFontStyle(style.fontWeight, style.fontStyle);
  const textAlign = style.textAlign || "left";

  pdf.setFontSize(fontSize);
  if (fontStyle === "bold") {
    pdf.setFont(style.fontFamily || "GoNotoKurrentBold", "bold");
  } else {
    pdf.setFont(style.fontFamily || "GoNotoKurrentRegular", "normal");
  }

  // Apply text color
  applyColor(pdf, style.color || "black", "text");

  // Split text into lines with proper word wrapping
  const words = text.trim().split(/\s+/);
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;

  words.forEach((word) => {
    const wordWidth = pdf.getTextWidth(word + " ");
    if (currentWidth + wordWidth <= maxWidth) {
      currentLine.push(word);
      currentWidth += wordWidth;
    } else {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "));
      }
      currentLine = [word];
      currentWidth = wordWidth;
    }
  });

  if (currentLine.length > 0) {
    lines.push(currentLine.join(" "));
  }

  // Render each line with proper alignment
  lines.forEach((line, i) => {
    let xPos = x;
    const lineWidth = pdf.getTextWidth(line);

    if (textAlign === "center") {
      xPos = x + (maxWidth - lineWidth) / 2;
    } else if (textAlign === "right") {
      xPos = x + maxWidth - lineWidth;
    }

    const yPos = y + (i * lineHeight) / pdf.internal.scaleFactor;
    pdf.text(line, xPos, yPos);
  });

  return y + (lines.length * lineHeight) / pdf.internal.scaleFactor;
};

/**
 * Render background and borders for an element
 * @param {jsPDF} pdf - PDF document
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Element width
 * @param {number} height - Element height
 * @param {Object} style - Element style
 * @param {Object} dimensions - Element dimensions
 */
const renderElementBackground = (
  pdf,
  x,
  y,
  width,
  height,
  style,
  dimensions
) => {
  // Save graphics state
  pdf.saveGraphicsState();

  // Draw background if specified
  const backgroundColor = style.backgroundColor;
  if (
    backgroundColor &&
    backgroundColor !== "transparent" &&
    backgroundColor !== "rgba(0, 0, 0, 0)"
  ) {
    applyColor(pdf, backgroundColor, "fill");
    // Account for borders in background size
    const bgX = x + dimensions.border.left / 2;
    const bgY = y + dimensions.border.top / 2;
    const bgWidth =
      width - (dimensions.border.left + dimensions.border.right) / 2;
    const bgHeight =
      height - (dimensions.border.top + dimensions.border.bottom) / 2;
    pdf.rect(bgX, bgY, bgWidth, bgHeight, "F");
  }

  // Draw borders if specified
  const borderTopWidth = dimensions.border.top;
  const borderRightWidth = dimensions.border.right;
  const borderBottomWidth = dimensions.border.bottom;
  const borderLeftWidth = dimensions.border.left;

  // Helper function to draw a border line
  const drawBorderLine = (startX, startY, endX, endY, width, color) => {
    if (width > 0) {
      pdf.setLineWidth(width / pdf.internal.scaleFactor);
      applyColor(pdf, color || "black", "fill");
      pdf.line(startX, startY, endX, endY);
    }
  };

  // Draw borders in correct order (same as browsers: top, right, bottom, left)
  // Top border
  drawBorderLine(
    x,
    y + borderTopWidth / 2,
    x + width,
    y + borderTopWidth / 2,
    borderTopWidth,
    style.borderTopColor
  );

  // Right border
  drawBorderLine(
    x + width - borderRightWidth / 2,
    y,
    x + width - borderRightWidth / 2,
    y + height,
    borderRightWidth,
    style.borderRightColor
  );

  // Bottom border
  drawBorderLine(
    x,
    y + height - borderBottomWidth / 2,
    x + width,
    y + height - borderBottomWidth / 2,
    borderBottomWidth,
    style.borderBottomColor
  );

  // Left border
  drawBorderLine(
    x + borderLeftWidth / 2,
    y,
    x + borderLeftWidth / 2,
    y + height,
    borderLeftWidth,
    style.borderLeftColor
  );

  // Restore graphics state
  pdf.restoreGraphicsState();
};

/**
 * Handle image elements
 * @param {jsPDF} pdf - PDF document
 * @param {HTMLImageElement} img - Image element
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} maxWidth - Maximum width
 * @returns {Promise<number>} New Y position after rendering
 */
const handleImageElement = async (pdf, img, x, y, maxWidth) => {
  if (!img.complete || !img.naturalWidth) return y;

  // Calculate image dimensions
  const imgWidth = parseFloat(img.width) || img.naturalWidth;
  const imgHeight = parseFloat(img.height) || img.naturalHeight;

  // Scale image if needed
  const scaleFactor = imgWidth > maxWidth ? maxWidth / imgWidth : 1;
  const finalWidth = imgWidth * scaleFactor;
  const finalHeight = imgHeight * scaleFactor;

  // Add image to PDF
  try {
    if (img.src.startsWith("data:")) {
      pdf.addImage(img.src, "JPEG", x, y, finalWidth, finalHeight);
    } else {
      // For external images, you might need to fetch them
      // This is a simplified approach
      pdf.addImage(img.src, "JPEG", x, y, finalWidth, finalHeight);
    }
    return y + finalHeight;
  } catch (err) {
    console.error("Error adding image to PDF:", err);
    return y;
  }
};

/**
 * Process HTML and convert to PDF
 * @param {Object} params
 * @param {jsPDF} params.pdf - The PDF document
 * @param {string} params.html - HTML content
 * @param {LayoutOptions} [params.options] - Layout options
 */
export const insertHtmlToPdf = ({ pdf, html, options = {} }) => {
  const {
    pagePadding = 20,
    lineHeight = 1.2,
    paragraphSpacing = 10,
    debug = false,
    defaultFont = "GoNotoKurrentRegular",
  } = options;

  // Process HTML with juice to inline CSS
  const processedHtml = juice(html);

  // Create DOM from processed HTML
  const dom = new JSDOM(processedHtml);
  const document = dom.window.document;

  // Get page dimensions
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - pagePadding * 2;

  // Current position in the document
  let currentX = pagePadding;
  let currentY = pagePadding;
  let inlineXOffset = 0;
  let inlineHeight = 0;

  // Store pending inline elements to handle line breaks
  let pendingInlineElements = [];

  // Function to flush pending inline elements
  const flushInlineElements = () => {
    if (pendingInlineElements.length === 0) return;

    // Calculate baseline for text alignment
    const maxHeight = Math.max(
      ...pendingInlineElements.map((el) =>
        el.type === "text"
          ? getTextDimensions(pdf, el.text, el.style, el.tagName).height
          : 0
      )
    );

    // Render all inline elements with proper baseline alignment
    pendingInlineElements.forEach((el) => {
      if (el.type === "text") {
        const dims = getTextDimensions(pdf, el.text, el.style, el.tagName);
        const baseline = maxHeight - dims.height;
        renderTextNode(
          pdf,
          el.text,
          el.x,
          currentY + baseline,
          el.style,
          contentWidth,
          el.tagName
        );
      }
    });

    currentY += maxHeight;
    pendingInlineElements = [];
    inlineXOffset = 0;
    inlineHeight = 0;
  };

  // Function to check if we need a new page
  const checkForNewPage = (neededHeight) => {
    if (currentY + neededHeight > pageHeight - pagePadding) {
      pdf.addPage();
      currentY = pagePadding;
      return true;
    }
    return false;
  };

  // Process DOM nodes recursively
  const processNode = (node, parentStyle = {}) => {
    // Skip comments and other non-element/text nodes
    if (
      node.nodeType !== NODE_TYPE.ELEMENT_NODE &&
      node.nodeType !== NODE_TYPE.TEXT_NODE
    ) {
      return;
    }

    // Get computed style for the node
    const style =
      node.nodeType === NODE_TYPE.ELEMENT_NODE
        ? dom.window.getComputedStyle(node)
        : parentStyle;

    // Get parent tag name for font size inheritance
    const parentTagName = node.parentElement ? node.parentElement.tagName : "P";

    // Text nodes
    if (node.nodeType === NODE_TYPE.TEXT_NODE) {
      const text = node.textContent.trim();
      if (!text) return;

      // Use parent style for text nodes
      const textDimensions = getTextDimensions(
        pdf,
        text,
        parentStyle,
        parentTagName
      );

      // Check if this inline text will fit on the current line
      if (
        parentStyle.display !== "block" &&
        parentStyle.display !== "inline-block" &&
        inlineXOffset + textDimensions.width <= contentWidth
      ) {
        // Add to pending inline elements
        pendingInlineElements.push({
          type: "text",
          text,
          x: currentX + inlineXOffset,
          style: parentStyle,
          tagName: parentTagName,
        });

        inlineXOffset += textDimensions.width;
        inlineHeight = Math.max(inlineHeight, textDimensions.height);
      } else {
        // Flush any pending inline elements before starting a new line
        flushInlineElements();

        // Check for page break
        checkForNewPage(textDimensions.height);

        // Add text to new line of pending elements
        pendingInlineElements.push({
          type: "text",
          text,
          x: currentX,
          style: parentStyle,
          tagName: parentTagName,
        });

        inlineXOffset = textDimensions.width;
        inlineHeight = textDimensions.height;
      }

      return;
    }

    // Element nodes
    const element = node;
    const tagName = element.tagName.toUpperCase();

    // Skip invisible elements
    if (style.display === "none" || style.visibility === "hidden") {
      return;
    }

    // If fontSize is not specified in style, use the default from tagNameToFontSize
    if (!style.fontSize || style.fontSize === "") {
      const defaultSize = tagNameToFontSize[tagName] || tagNameToFontSize.P;
      style.fontSize = defaultSize + "px";
    }

    // Get element dimensions
    const dimensions = getElementDimensions(element, style, contentWidth);

    // Handle block elements
    if (dimensions.isBlock) {
      // Flush any pending inline elements
      flushInlineElements();

      // Add margins
      currentY += dimensions.margin.top;

      // Check if we need a new page
      const estimatedHeight =
        dimensions.padding.top +
        dimensions.padding.bottom +
        (tagName === "IMG"
          ? parseFloat(element.height) || 100
          : parseFloat(style.lineHeight) || 20);

      checkForNewPage(estimatedHeight);

      // Calculate element width and position
      const elementX = currentX + dimensions.margin.left;
      const elementWidth = dimensions.innerWidth;
      const contentX =
        elementX + dimensions.padding.left + dimensions.border.left;
      const contentWidth =
        elementWidth -
        dimensions.padding.left -
        dimensions.padding.right -
        dimensions.border.left -
        dimensions.border.right;

      // Start Y position for content
      let elementY = currentY;
      const contentY =
        elementY + dimensions.padding.top + dimensions.border.top;

      // Track the height of the content
      let contentHeight = 0;
      const startY = currentY;

      // Render element background and borders
      if (debug) {
        // Draw debug box
        pdf.setDrawColor(200, 0, 0);
        pdf.setLineWidth(0.1);
        pdf.rect(elementX, elementY, elementWidth, 10); // Temporary height
      }

      // Prepare for children
      currentX = contentX;
      currentY = contentY;

      // Process children
      for (const child of element.childNodes) {
        processNode(child, style);
      }

      // Calculate actual content height
      contentHeight = currentY - contentY;

      // Draw actual background and borders with correct height
      const totalHeight =
        contentHeight +
        dimensions.padding.top +
        dimensions.padding.bottom +
        dimensions.border.top +
        dimensions.border.bottom;

      renderElementBackground(
        pdf,
        elementX,
        elementY,
        elementWidth,
        totalHeight,
        style,
        dimensions
      );

      // Restore positions
      currentX = pagePadding;
      currentY = elementY + totalHeight + dimensions.margin.bottom;
    }
    // Handle special elements
    else if (tagName === "IMG") {
      // Flush pending inline elements
      flushInlineElements();

      // Handle image - simplified for example
      currentY += 10; // Placeholder for image handling
    }
    // Handle inline elements
    else {
      // Process children for inline elements
      for (const child of element.childNodes) {
        processNode(child, style);
      }
    }
  };

  // Start processing from body
  processNode(document.body);

  // Flush any remaining inline elements
  flushInlineElements();
};

/**
 * Generate PDF from HTML
 * @param {Object} params
 * @param {string} params.html - HTML content
 * @param {LayoutOptions} [params.options] - Layout options
 * @param {string} [params.pdfPath] - Output path for the PDF file
 */
export function generatePdf({ html, options, pdfPath = "./output/a4.pdf" }) {
  const pdf = new jsPDF();

  // Add custom font
  pdf.addFileToVFS("GoNotoKurrent-Regular.ttf", globalFontRegular);
  pdf.addFileToVFS("GoNotoKurrent-Bold.ttf", globalFontBold);
  pdf.addFont("GoNotoKurrent-Regular.ttf", "GoNotoKurrentRegular", "normal");
  pdf.addFont("GoNotoKurrent-Bold.ttf", "GoNotoKurrentBold", "bold");
  pdf.setFont("GoNotoKurrentRegular", "normal");

  insertHtmlToPdf({ pdf, html, options });

  pdf.save(pdfPath);
}
