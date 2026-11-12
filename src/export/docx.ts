/**
 * Word (.docx), written by hand: a ZIP of a few XML files that Word, Pages, Google Docs and
 * LibreOffice all open.
 *
 * Two looks:
 * - Manuscript: standard manuscript format, as editors, agents and competitions ask for it.
 *   12 pt Times New Roman, double-spaced, first lines indented, a title page with the word count,
 *   "Surname / TITLE / page" at the top of each page, each chapter on a new page a third of the
 *   way down, "#" for a scene break.
 * - Clean: a readable document (Georgia 11 pt, a little space between paragraphs, no running head).
 */
import { esc, wordCount, type Block, type BookDetails, type Chapter, type ExportImage, type Span } from "./model";
import { zip } from "./zip";

export type WordStyle = "manuscript" | "clean";

interface Options {
  details: BookDetails;
  chapters: Chapter[];
  images: Map<string, ExportImage>;
  style: WordStyle;
  /** A title page (books); a single note starts with its title instead. */
  titlePage: boolean;
}

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** Word takes these picture formats; others are left out with a note in their place. */
const WORD_PICTURES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif" };
const EMU_PER_INCH = 914400;
const MAX_WIDTH_IN = 6;

export function docx({ details, chapters, images, style, titlePage }: Options): Uint8Array<ArrayBuffer> {
  const ms = style === "manuscript";
  const rels: string[] = [];
  const media: { name: string; data: Uint8Array }[] = [];
  const imageIds = new Map<string, string>();
  let nextId = 10;
  let drawingId = 1;

  const linkId = (href: string) => {
    const id = `rId${nextId++}`;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`);
    return id;
  };
  const imageId = (path: string, img: ExportImage) => {
    let id = imageIds.get(path);
    if (!id) {
      id = `rId${nextId++}`;
      const name = `image${media.length + 1}.${WORD_PICTURES[img.type]}`;
      media.push({ name, data: img.data });
      rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      imageIds.set(path, id);
    }
    return id;
  };

  // --- runs and paragraphs -----------------------------------------------------------------------

  const run = (text: string, props = "") =>
    text
      .split("\n")
      .map((part, i) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>`)
      .join("");

  const runs = (spans: Span[], extra = "") =>
    spans
      .map((s) => {
        const props = `${s.bold ? "<w:b/>" : ""}${s.italic ? "<w:i/>" : ""}${s.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : ""}${extra}`;
        if (s.href && /^(https?:|mailto:)/i.test(s.href)) {
          return `<w:hyperlink r:id="${linkId(s.href)}">${run(s.text, `<w:rStyle w:val="Hyperlink"/>${props}`)}</w:hyperlink>`;
        }
        return run(s.text, props);
      })
      .join("");

  const para = (style: string, content: string, pPr = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${pPr}</w:pPr>${content}</w:p>`;

  const picture = (path: string | null, alt: string): string => {
    const img = path ? images.get(path) : undefined;
    if (!img || !WORD_PICTURES[img.type]) return run(`[Picture${alt ? `: ${alt}` : ""}]`, "<w:i/>");
    const scale = Math.min(1, (MAX_WIDTH_IN * 96) / Math.max(1, img.width));
    const cx = Math.round((img.width * scale * EMU_PER_INCH) / 96);
    const cy = Math.round((img.height * scale * EMU_PER_INCH) / 96);
    const id = drawingId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${esc(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${imageId(path!, img)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };

  const blocks = (list: Block[], inQuote: "" | "quote" | "pull" = ""): string =>
    list
      .map((b) => {
        switch (b.t) {
          case "heading":
            return para(b.level === 2 ? "Heading2" : "Heading3", runs(b.spans));
          case "para":
            return para(inQuote === "pull" ? "PullQuote" : inQuote ? "Quote" : "BodyText", runs(b.spans));
          case "quote":
            return blocks(b.blocks, b.pull ? "pull" : "quote");
          case "list":
            return b.items
              .map((item, i) => {
                const mark = b.ordered ? `${b.start + i}.` : "•";
                return item
                  .map((x, j) =>
                    x.t === "para" ? para("ListText", (j === 0 ? run(`${mark}\t`) : "") + runs(x.spans)) : blocks([x], inQuote),
                  )
                  .join("");
              })
              .join("");
          case "break":
            return para("SceneBreak", run(ms ? "#" : "* * *"));
          case "image":
            return para("Picture", picture(b.path, b.alt)) + (b.caption ? para("Caption", run(b.caption)) : "");
          case "code":
            return b.text
              .split("\n")
              .map((line) => para("Code", run(line)))
              .join("");
          case "table":
            return table(b.rows);
        }
      })
      .join("");

  const table = (rows: string[][]) => {
    const border = '<w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/>';
    const body = rows
      .map((r, i) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para("TableText", run(c, i === 0 ? "<w:b/>" : ""))}</w:tc>`).join("")}</w:tr>`)
      .join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${body}</w:tbl>${para("BodyText", "")}`;
  };

  // --- the document --------------------------------------------------------------------------------

  const words = wordCount(chapters);
  const rounded = words < 1000 ? words : Math.round(words / 1000) * 1000;
  const title = details.title || chapters[0]?.title || "Untitled";
  const body: string[] = [];
  if (titlePage) {
    if (ms) {
      body.push(para("Contact", run(details.author || " ")));
      body.push(para("WordCount", run(`about ${rounded.toLocaleString("en")} words`)));
      body.push(para("TitlePageTitle", run(title.toUpperCase())));
    } else body.push(para("TitlePageTitle", run(title)));
    if (details.subtitle) body.push(para("TitlePageSubtitle", run(details.subtitle)));
    if (details.author) body.push(para("TitlePageAuthor", run(`by ${details.author}`)));
  }
  chapters.forEach((c, i) => {
    // The first chapter of a single note sits at the top; every other starts a new page.
    const first = !titlePage && i === 0;
    // The page break is on the paragraph too: some readers ignore it in the style.
    body.push(para(first ? "NoteTitle" : "ChapterTitle", run(c.title || `Chapter ${i + 1}`), first ? "" : "<w:pageBreakBefore/>"));
    if (c.subtitle) body.push(para("ChapterSubtitle", run(c.subtitle)));
    body.push(blocks(c.blocks));
  });
  if (ms) body.push(para("SceneBreak", run("END"), '<w:spacing w:before="480"/>'));

  const surname = (details.author.trim().split(/\s+/).pop() ?? "").trim();
  const headerText = [surname, title.toUpperCase()].filter(Boolean).join(" / ");
  const sect = `<w:sectPr>${ms ? '<w:headerReference w:type="default" r:id="rId3"/>' : ""}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>${ms && titlePage ? "<w:titlePg/>" : ""}</w:sectPr>`;
  const document = `${XML}<w:document ${W_NS}><w:body>${body.join("")}${sect}</w:body></w:document>`;

  const header = `${XML}<w:hdr ${W_NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run(`${headerText} / `)}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`;

  const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>${rels.join("")}</Relationships>`;
  const settings = `${XML}<w:settings ${W_NS}><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(details.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;

  return zip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "docProps/core.xml", data: core },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: styles(ms) },
    { name: "word/settings.xml", data: settings },
    { name: "word/header1.xml", data: header },
    { name: "word/_rels/document.xml.rels", data: docRels },
    ...media.map((m) => ({ name: `word/media/${m.name}`, data: m.data })),
  ]);
}

/** The look, as Word styles, so a writer can still change it in Word afterwards. */
function styles(ms: boolean): string {
  const font = ms ? "Times New Roman" : "Georgia";
  const size = ms ? 24 : 22;
  const line = ms ? 480 : 300;
  const after = ms ? 0 : 160;
  const indent = ms ? '<w:ind w:firstLine="720"/>' : "";
  const st = (id: string, name: string, pPr: string, rPr = "", basedOn = "Normal") =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/><w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  const center = '<w:jc w:val="center"/>';
  const single = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
  return `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${st("BodyText", "Body Text", indent)}
${st("ChapterTitle", "Heading 1", `<w:pageBreakBefore/><w:keepNext/>${center}<w:spacing w:before="${ms ? 2880 : 1440}" w:after="${ms ? 480 : 360}"/><w:outlineLvl w:val="0"/>`, ms ? "" : '<w:b/><w:sz w:val="36"/>')}
${st("NoteTitle", "Title", `<w:keepNext/>${ms ? center : ""}<w:spacing w:before="0" w:after="${ms ? 480 : 240}"/><w:outlineLvl w:val="0"/>`, ms ? "" : '<w:b/><w:sz w:val="40"/>')}
${st("ChapterSubtitle", "Subtitle", `<w:keepNext/>${center}`, "<w:i/>")}
${st("Heading2", "Heading 2", `<w:keepNext/><w:spacing w:before="${ms ? 240 : 320}" w:after="${ms ? 0 : 120}"/><w:outlineLvl w:val="1"/>`, ms ? "<w:b/>" : '<w:b/><w:sz w:val="28"/>')}
${st("Heading3", "Heading 3", `<w:keepNext/><w:spacing w:before="${ms ? 240 : 240}" w:after="${ms ? 0 : 80}"/><w:outlineLvl w:val="2"/>`, ms ? "<w:b/><w:i/>" : '<w:b/><w:sz w:val="24"/>')}
${st("Quote", "Quote", '<w:ind w:left="720" w:right="720"/>')}
${st("PullQuote", "Intense Quote", `${center}<w:ind w:left="720" w:right="720"/>`, `<w:i/>${ms ? "" : '<w:sz w:val="30"/>'}`)}
${st("ListText", "List Paragraph", '<w:ind w:left="720" w:hanging="360"/>')}
${st("SceneBreak", "Scene Break", `${center}<w:keepNext/>`)}
${st("Picture", "Picture", `${center}<w:keepNext/>`)}
${st("Caption", "Caption", center, `<w:i/><w:sz w:val="${size - 4}"/>`)}
${st("Code", "Code", single, `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="${size - 4}"/>`)}
${st("TableText", "Table Text", single)}
${st("Contact", "Contact", single)}
${st("WordCount", "Word Count", `<w:jc w:val="right"/>${single}`)}
${st("TitlePageTitle", "Book Title", `${center}<w:spacing w:before="${ms ? 4320 : 3600}" w:after="240"/>`, ms ? "" : '<w:b/><w:sz w:val="56"/>')}
${st("TitlePageSubtitle", "Book Subtitle", center, "<w:i/>")}
${st("TitlePageAuthor", "Book Author", `${center}<w:spacing w:before="240"/>`)}
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr>${ms ? "<w:u w:val=\"single\"/>" : '<w:color w:val="1F4E79"/><w:u w:val="single"/>'}</w:rPr></w:style>
</w:styles>`;
}
