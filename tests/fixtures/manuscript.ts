/** A small Word manuscript, built in the test, for the unit and browser tests of Import. */
import { zip } from "../../src/export/zip";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="w" xmlns:a="a"';

export const p = (text: string, style = "", extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
export const run = (text: string, props = "") => `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;

/** A Word file as Google Docs writes one: styles by id, lists by number, links and pictures by relationship. */
export function wordFile(body: string, more: { name: string; data: Uint8Array | string }[] = []) {
  return zip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0"?><w:styles ${W}>
        <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="normal"/></w:style>
        <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
        <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
        <w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="Überschrift 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
        <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
        <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style>
        <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
        <w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:rPr><w:i/></w:rPr></w:style>
      </w:styles>`,
    },
    {
      name: "word/numbering.xml",
      data: `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      data: `<Relationships><Relationship Id="rId5" Type="hyperlink" Target="https://example.org/a b" TargetMode="External"/><Relationship Id="rId6" Type="image" Target="media/image1.png"/><Relationship Id="rId7" Type="image" Target="media/image2.emf"/></Relationships>`,
    },
    { name: "word/document.xml", data: `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>` },
    ...more,
  ]);
}

export const NOVEL =
  p("The Salt Road", "Title") +
  p("by A. Writer") +
  p("Contents line", "TOC1") +
  p("Chapter One", "Heading1") +
  `<w:p>${run("Ines came ")}${run("home", "<w:b/>")}${run(" in ", "<w:b w:val=\"0\"/>")}${run("the ", "<w:i/>")}${run("rain", "<w:i/>")}${run(". 2 * 3 &lt; 7 &amp; so on.")}</w:p>` +
  `<w:p>${run("She read ")}<w:hyperlink r:id="rId5">${run("the letter")}</w:hyperlink>${run(" twice")}<w:del><w:r><w:delText>, slowly</w:delText></w:r></w:del><w:ins>${run(", fast")}</w:ins>${run(".")}<w:r><w:footnoteReference w:id="2"/></w:r></w:p>` +
  p("* * *") +
  p("1. The first thing she saw was the door.") +
  p("Bread", "", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
  p("Salt", "", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
  p("First", "", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>') +
  p("A line someone said.", "Quote") +
  p("") +
  p("The harbour", "Heading2") +
  `<w:p>${run("Line one")}<w:r><w:br/></w:r>${run("line two", "<w:rStyle w:val=\"Emphasis\"/>")}</w:p>` +
  `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="p" descr="The quay at dusk"/><a:graphic><a:blip r:embed="rId6"/></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
  `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:blip r:embed="rId7"/></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
  p("Part Two", "berschrift1") +
  p("Chapter Two", "Heading1") +
  `<w:tbl><w:tr><w:tc>${p("Year")}</w:tc><w:tc>${p("What")}</w:tc></w:tr><w:tr><w:tc>${p("1901")}</w:tc><w:tc>${p("The storm | flood")}</w:tc></w:tr></w:tbl>` +
  p("The end.");

export const novel = () =>
  wordFile(NOVEL, [
    { name: "word/media/image1.png", data: new Uint8Array([137, 80, 78, 71]) },
    { name: "word/media/image2.emf", data: new Uint8Array([1, 2]) },
    { name: "word/comments.xml", data: `<w:comments ${W}><w:comment w:id="1"><w:p/></w:comment></w:comments>` },
  ]);
