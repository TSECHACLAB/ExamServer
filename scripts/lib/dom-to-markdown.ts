export interface MarkdownImage {
  id: string;
  filename: string;
  sourceUrl: string;
  alt: string;
}

export interface MarkdownConversionOptions {
  imagePrefix: string;
  baseUrl: string;
  images: MarkdownImage[];
}

export function compactJapaneseText(value: string): string {
  return value
    .replaceAll("\u00a0", " ")
    .replace(/([一-龯々])\([ぁ-ん]+\)(?=[一-龯々])/g, "$1")
    .replaceAll("公開健", "公開鍵")
    .replaceAll("フオーム", "フォーム")
    .replaceAll("セキュリテイ", "セキュリティ")
    .replaceAll("最高情報セキュリティ賞任者", "最高情報セキュリティ責任者")
    .replaceAll("影騨", "影響")
    .replaceAll("とおリ", "とおり")
    .replaceAll("X情報は.US部", "X情報は，US部")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOnly(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  const element = node as Element;
  if (["rt", "script", "style"].includes(element.tagName.toLowerCase())) {
    return "";
  }
  return Array.from(element.childNodes).map(textOnly).join("");
}

function tableToMarkdown(
  table: Element,
  options: MarkdownConversionOptions,
): string {
  const rows = Array.from(
    table.querySelectorAll(
      ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr",
    ),
  )
    .map((row) =>
      Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) =>
        compactJapaneseText(
          Array.from(cell.childNodes)
            .map((node) => nodeToMarkdown(node, options))
            .join(" "),
        ).replaceAll("|", "\\|"),
      ),
    )
    .filter((row) => row.length > 0);
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [
    ...row,
    ...Array<string>(width - row.length).fill(""),
  ]);
  const header = normalized[0];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function imageToMarker(
  element: Element,
  options: MarkdownConversionOptions,
): string {
  const rawSource = element.getAttribute("src");
  if (!rawSource) return "";
  const sourceUrl = new URL(rawSource, options.baseUrl).toString();
  const filename = new URL(sourceUrl).pathname.split("/").at(-1) ?? "figure";
  const id = `${options.imagePrefix}-f${String(options.images.length + 1).padStart(2, "0")}`;
  const alt = compactJapaneseText(element.getAttribute("alt") ?? "") || "公式問題の図表";
  options.images.push({ id, filename, sourceUrl, alt });
  return `[[OFFICIAL_FIGURE:${id}]]`;
}

function listItemToMarkdown(
  element: Element,
  options: MarkdownConversionOptions,
): string {
  const parentTag = element.parentElement?.tagName.toLowerCase();
  const siblings = parentTag === "ol"
    ? Array.from(element.parentElement?.children ?? []).filter(
        (candidate) => candidate.tagName.toLowerCase() === "li",
      )
    : [];
  const marker = parentTag === "ol" ? `${siblings.indexOf(element) + 1}.` : "-";
  const content = Array.from(element.childNodes)
    .map((node) => nodeToMarkdown(node, options))
    .join("");
  return `\n${marker} ${content}\n`;
}

function nodeToMarkdown(
  node: Node,
  options: MarkdownConversionOptions,
): string {
  if (node.nodeType === node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== node.ELEMENT_NODE) return "";
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "rt", "noscript"].includes(tag)) return "";
  if (tag === "br") return "\n";
  if (tag === "img") return imageToMarker(element, options);
  if (tag === "table") return `\n${tableToMarkdown(element, options)}\n`;
  if (tag === "sub") return `_{${compactJapaneseText(textOnly(element))}}`;
  if (tag === "sup") return `^{${compactJapaneseText(textOnly(element))}}`;
  if (tag === "li") return listItemToMarkdown(element, options);
  if (tag === "pre") {
    return `\n\`\`\`\n${compactJapaneseText(textOnly(element))}\n\`\`\`\n`;
  }

  const content = Array.from(element.childNodes)
    .map((child) => nodeToMarkdown(child, options))
    .join("");
  if (tag === "dt") {
    const term = content.trim().replace(/[：:]+$/, "");
    return `\n- ${term}： `;
  }
  if (tag === "dd") return `${content.replace(/^\s*[：:]\s*/, "")}\n`;
  if (
    [
      "address",
      "article",
      "blockquote",
      "div",
      "dl",
      "figure",
      "figcaption",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ol",
      "p",
      "section",
      "ul",
    ].includes(tag)
  ) {
    return `\n${content}\n`;
  }
  return content;
}

export function elementToMarkdown(
  element: Element,
  options: MarkdownConversionOptions,
): string {
  return compactJapaneseText(
    Array.from(element.childNodes)
      .map((node) => nodeToMarkdown(node, options))
      .join(""),
  );
}
