import fs from "fs";
import path from "path";

import puppeteer from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { toMatchImageSnapshot } from "jest-image-snapshot";
import { fromPath } from "pdf2pic";

import { generatePdf } from "./index.mjs";

// Configure image snapshot matcher with more lenient settings
const customConfig = {
  customDiffConfig: { threshold: 0.3 },
  failureThreshold: 0.05,
  failureThresholdType: "percent",
};
expect.extend({ toMatchImageSnapshot });

// Helper function to create test HTML
const createTestHtml = (content) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <div class="test-content">
    ${content}
  </div>
</body>
</html>
`;

// Helper function to save test HTML
const saveTestHtml = (content, filename) => {
  const html = createTestHtml(content);
  fs.writeFileSync(filename, html);
  return html;
};

// Helper function to capture browser screenshot
const captureBrowserScreenshot = async (htmlPath, outputPath) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({
    width: 595,
    height: 842,
    deviceScaleFactor: 1,
  });

  await page.goto(`file://${path.resolve(htmlPath)}`, {
    waitUntil: "networkidle0",
  });

  await page.screenshot({
    path: outputPath,
    fullPage: true,
  });

  await browser.close();
};

// Helper function to compare image buffers with more lenient settings
const compareImageBuffers = (
  imageBuffer1,
  imageBuffer2,
  allowedDifferencePercent = 1.0 // Allow up to 1% difference by default
) => {
  const png1 = PNG.sync.read(imageBuffer1);
  const png2 = PNG.sync.read(imageBuffer2);

  // Ensure images have the same dimensions for comparison
  if (png1.width !== png2.width || png1.height !== png2.height) {
    throw new Error(
      `Images have different dimensions: (${png1.width}x${png1.height}) vs (${png2.width}x${png2.height})`
    );
  }

  const { width, height } = png1;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    png1.data,
    png2.data,
    diff.data,
    width,
    height,
    { threshold: 0.2 } // More lenient threshold for pixel comparison
  );

  const totalPixels = width * height;
  const actualDifferencePercent = (numDiffPixels / totalPixels) * 100;
  console.log(`Actual difference: ${actualDifferencePercent.toFixed(3)}%`);

  expect(actualDifferencePercent).toBeLessThanOrEqual(allowedDifferencePercent);
};

// Helper to convert PDF to image for visual comparison
async function pdfToImage(pdfPath) {
  // Use pdf2pic instead of pdf-img-convert
  const baseDir = path.dirname(pdfPath);
  const fileName = path.basename(pdfPath, ".pdf");

  const convert = fromPath(pdfPath, {
    density: 300, // Higher density for better quality
    saveFilename: fileName,
    savePath: baseDir,
    format: "png",
    width: 595, // A4 width in points
    height: 842, // A4 height in points
    preserveAspectRatio: true,
    preserveColors: true,
    backgroundColor: "#FFFFFF", // Ensure white background
  });

  // Convert the first page
  const result = await convert(1);

  // Return the image buffer
  const outputPath = path.join(baseDir, `${fileName}.1.png`);
  if (fs.existsSync(outputPath)) {
    return fs.readFileSync(outputPath);
  } else {
    throw new Error(
      `PDF conversion failed: output file ${outputPath} not found`
    );
  }
}

describe("HTML to PDF Conversion", () => {
  const artifactsDir = "./test-artifacts";

  beforeAll(() => {
    fs.rmSync(artifactsDir, { recursive: true, force: true });
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir);
    }

    // Create output directory for test results if it doesn't exist
    if (!fs.existsSync("./output")) {
      fs.mkdirSync("./output");
    }
  });

  afterAll(() => {
    // Clean up test files
  });

  test("Basic Text Rendering Test", async () => {
    const testName = "basic-text";
    const htmlPath = path.join(artifactsDir, `${testName}.html`);
    const pdfPath = path.join(artifactsDir, `${testName}.pdf`);
    const browserScreenshotPath = path.join(
      artifactsDir,
      `${testName}-browser.png`
    );
    const pdfScreenshotPath = path.join(artifactsDir, `${testName}.1.png`);

    // Create and save test HTML
    const content = `
      <h1 style="color: red;">Basic Text Test</h1>
      <p>This is a paragraph with some text.</p>
      <p>Another paragraph with different content.</p>
    `;
    saveTestHtml(content, htmlPath);

    // Generate PDF
    generatePdf({
      html: content,
      options: {
        pagePadding: 20,
        lineHeight: 1.2,
        paragraphSpacing: 10,
      },
      pdfPath,
    });

    // Ensure PDF file exists before converting
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not created: ${pdfPath}`);
    }
    console.log("PDF created:", pdfPath);
    console.log("Artifacts dir after PDF:", fs.readdirSync(artifactsDir));

    // Capture browser screenshot
    await captureBrowserScreenshot(htmlPath, browserScreenshotPath);
    console.log(
      "Artifacts dir after browser screenshot:",
      fs.readdirSync(artifactsDir)
    );

    // Convert PDF to image using pdf2pic
    const convert = fromPath(pdfPath, {
      density: 72, // Match browser DPI
      saveFilename: testName,
      savePath: artifactsDir,
      format: "png",
      width: 595, // Match A4 width in points
      height: 842, // Match A4 height in points
      preserveAspectRatio: true,
      preserveColors: true,
      backgroundColor: "#FFFFFF", // Ensure white background
    });
    await convert(1);
    console.log("Artifacts dir after pdf2pic:", fs.readdirSync(artifactsDir));

    // Compare browser screenshot with PDF screenshot
    const browserImage = fs.readFileSync(browserScreenshotPath);
    const pdfImage = fs.readFileSync(pdfScreenshotPath);

    // Use jest-image-snapshot for comparison
    expect(browserImage).toMatchImageSnapshot({
      customSnapshotIdentifier: `${testName}-browser`,
      ...customConfig,
    });

    expect(pdfImage).toMatchImageSnapshot({
      customSnapshotIdentifier: `${testName}-pdf`,
      ...customConfig,
    });

    // Compare PDF screenshot with HTML screenshot using pixelmatch
    compareImageBuffers(browserImage, pdfImage);
  }, 20000);

  test("Layout Options Test", async () => {
    const testName = "layout-options";
    const htmlPath = path.join(artifactsDir, `${testName}.html`);
    const pdfPath = path.join(artifactsDir, `${testName}.pdf`);
    const browserScreenshotPath = path.join(
      artifactsDir,
      `${testName}-browser.png`
    );
    const pdfScreenshotPath = path.join(artifactsDir, `${testName}.1.png`);

    const content = `
      <div style="padding: 30px; line-height: 1.5;">
        <h1>Layout Test</h1>
        <p style="margin-bottom: 20px;">Paragraph with custom spacing</p>
        <p>Another paragraph with different spacing</p>
      </div>
    `;
    saveTestHtml(content, htmlPath);

    generatePdf({
      html: content,
      options: {
        pagePadding: 30,
        lineHeight: 1.5,
        paragraphSpacing: 20,
      },
      pdfPath,
    });

    await captureBrowserScreenshot(htmlPath, browserScreenshotPath);

    const convert = fromPath(pdfPath, {
      density: 72, // Match browser DPI
      saveFilename: testName,
      savePath: artifactsDir,
      format: "png",
      width: 595, // Match A4 width in points
      height: 842, // Match A4 height in points
      preserveAspectRatio: true,
      preserveColors: true,
      backgroundColor: "#FFFFFF", // Ensure white background
    });
    await convert(1);

    const browserImage = fs.readFileSync(browserScreenshotPath);
    const pdfImage = fs.readFileSync(pdfScreenshotPath);

    expect(browserImage).toMatchImageSnapshot({
      customSnapshotIdentifier: `${testName}-browser`,
      ...customConfig,
    });

    expect(pdfImage).toMatchImageSnapshot({
      customSnapshotIdentifier: `${testName}-pdf`,
      ...customConfig,
    });

    // Compare PDF screenshot with HTML screenshot using pixelmatch
    compareImageBuffers(browserImage, pdfImage);
  }, 20000);

  // Test common HTML structures
  describe("Basic HTML elements", () => {
    test("renders headings with correct sizes", async () => {
      const html = `
        <html>
          <body>
            <h1>Heading 1</h1>
            <h2>Heading 2</h2>
            <h3>Heading 3</h3>
          </body>
        </html>
      `;

      const outputPath = path.join(artifactsDir, "headings-test.pdf");
      generatePdf({ html, pdfPath: outputPath });

      // Convert PDF to image for visual comparison
      const pdfImage = await pdfToImage(outputPath);
      expect(pdfImage).toMatchImageSnapshot({
        customSnapshotIdentifier: "headings-test",
        ...customConfig,
      });
    });

    test("renders paragraphs with proper spacing", async () => {
      const html = `
        <html>
          <body>
            <p>First paragraph with some text.</p>
            <p>Second paragraph with some more text.</p>
            <p>Third paragraph to test spacing between elements.</p>
          </body>
        </html>
      `;

      const outputPath = path.join(artifactsDir, "paragraphs-test.pdf");
      generatePdf({ html, pdfPath: outputPath });

      const pdfImage = await pdfToImage(outputPath);
      expect(pdfImage).toMatchImageSnapshot({
        customSnapshotIdentifier: "paragraphs-test",
        ...customConfig,
      });
    });
  });

  // Test CSS styling
  describe("CSS styling", () => {
    test("applies font styles (bold, italic) correctly", async () => {
      const html = `
        <html>
          <body>
            <p>Regular text</p>
            <p><strong>Bold text</strong></p>
            <p><em>Italic text</em></p>
            <p><strong><em>Bold and italic text</em></strong></p>
          </body>
        </html>
      `;

      const outputPath = path.join(artifactsDir, "font-styles-test.pdf");
      generatePdf({ html, pdfPath: outputPath });

      const pdfImage = await pdfToImage(outputPath);
      expect(pdfImage).toMatchImageSnapshot({
        customSnapshotIdentifier: "font-styles-test",
        ...customConfig,
      });
    });

    test("applies text alignment correctly", async () => {
      const html = `
        <html>
          <style>
            .left { text-align: left; }
            .center { text-align: center; }
            .right { text-align: right; }
          </style>
          <body>
            <p class="left">Left aligned text</p>
            <p class="center">Center aligned text</p>
            <p class="right">Right aligned text</p>
          </body>
        </html>
      `;

      const outputPath = path.join(artifactsDir, "text-alignment-test.pdf");
      generatePdf({ html, pdfPath: outputPath });

      const pdfImage = await pdfToImage(outputPath);
      expect(pdfImage).toMatchImageSnapshot({
        customSnapshotIdentifier: "text-alignment-test",
        ...customConfig,
      });
    });
  });

  // Test complex layouts
  describe("Complex layouts", () => {
    test("renders nested elements correctly", async () => {
      const html = `
        <html>
          <body>
            <div style="border: 1px solid black; padding: 10px;">
              <h2>Nested content</h2>
              <div style="margin: 10px; background-color: #f0f0f0;">
                <p>This is nested inside two divs</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const outputPath = path.join(artifactsDir, "nesting-test.pdf");
      generatePdf({ html, pdfPath: outputPath });

      const pdfImage = await pdfToImage(outputPath);
      expect(pdfImage).toMatchImageSnapshot({
        customSnapshotIdentifier: "nested-elements-test",
        ...customConfig,
      });
    });
  });
});
