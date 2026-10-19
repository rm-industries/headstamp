export interface HeaderValue {
  pattern: string;
  replacement: string;
}

export interface HeaderOptions {
  template: string;
  values?: Record<string, HeaderValue>;
  allowedLeadingComments?: Array<string | { pattern: string }>;
}

interface Field {
  name: string;
  pattern: RegExp;
  replacement: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCompleteComment(text: string): boolean {
  const isBlockComment = text.length >= 4 && text.startsWith('/*') && text.indexOf('*/') === text.length - 2;
  const isLineCommentGroup = text.split('\n').every((line) => line.startsWith('//'));
  const hasSupportedCommentStyle = isBlockComment || isLineCommentGroup;
  const hasUnsupportedLineEndings = /[\r\u2028\u2029]/.test(text);
  return hasSupportedCommentStyle && !hasUnsupportedLineEndings;
}

function fullValuePattern(pattern: string): RegExp {
  const expression = new RegExp(pattern);
  return new RegExp(`^(?:${expression.source})$`);
}

function matchValues(
  comment: string,
  parts: string[],
  fields: Field[],
  checkPatterns: boolean,
): string[] | 'ambiguous' | null {
  if (!comment.startsWith(parts[0])) return null;
  type Captures = { count: number; values: string[] };
  const memo = new Map<string, Captures>();
  function visit(index: number, start: number): Captures {
    if (index === fields.length) return { count: start === comment.length ? 1 : 0, values: [] };
    const key = `${index}:${start}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const field = fields[index];
    const delimiter = parts[index + 1];
    const nextLineBreak = comment.slice(start).search(/[\r\n\u2028\u2029]/);
    const lineEnd = nextLineBreak < 0 ? comment.length : start + nextLineBreak;
    let end = delimiter.length === 0 ? comment.length : comment.indexOf(delimiter, start);
    const result: Captures = { count: 0, values: [] };
    while (end >= 0 && end <= lineEnd) {
      const value = comment.slice(start, end);
      const isAllowedValue = !checkPatterns || field.pattern.test(value);
      if (isAllowedValue) {
        const tail = visit(index + 1, end + delimiter.length);
        if (tail.count > 0) {
          if (result.count === 0) result.values = [value, ...tail.values];
          result.count += tail.count;
          // Two matches already prove ambiguity; do not enumerate further splits.
          if (result.count >= 2) break;
        }
      }
      end = delimiter.length === 0 ? -1 : comment.indexOf(delimiter, end + 1);
    }
    memo.set(key, result);
    return result;
  }
  const result = visit(0, parts[0].length);
  if (result.count === 0) return null;
  return result.count === 1 ? result.values : 'ambiguous';
}

export function prepareHeader(options: unknown) {
  if (!isRecord(options)) throw new Error('Headstamp requires a template string and optional values map.');
  const configuredTemplate = options.template;
  const hasTemplateString = typeof configuredTemplate === 'string';
  const hasKnownOptions = Object.keys(options).every(
    (key) => key === 'template' || key === 'values' || key === 'allowedLeadingComments',
  );
  if (!hasTemplateString || !hasKnownOptions)
    throw new Error('Headstamp requires a template string and optional values map.');
  const leadingComments = options.allowedLeadingComments === undefined ? [] : options.allowedLeadingComments;
  if (!Array.isArray(leadingComments)) throw new Error('Headstamp allowedLeadingComments must be an array.');
  const allowedLeadingComments = leadingComments.map((comment: unknown) => {
    if (typeof comment === 'string') {
      const normalized = comment.replace(/\r\n/g, '\n').replace(/\n+$/, '');
      if (!isCompleteComment(normalized)) throw new Error('Headstamp permitted literals must be complete comments.');
      return normalized;
    }
    if (!isRecord(comment))
      throw new Error('Headstamp permitted comments require a literal comment or pattern string.');
    const pattern = comment.pattern;
    const hasPatternString = typeof pattern === 'string';
    const hasOnlyPattern = Object.keys(comment).length === 1;
    if (!hasPatternString || !hasOnlyPattern)
      throw new Error('Headstamp permitted comments require a literal comment or pattern string.');
    try {
      return fullValuePattern(pattern);
    } catch {
      throw new Error('Headstamp permitted comment has an invalid regex.');
    }
  });
  const values = options.values === undefined ? {} : options.values;
  if (!isRecord(values)) throw new Error('Headstamp values must be an object.');
  const template = configuredTemplate.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (!isCompleteComment(template))
    throw new Error(
      'Headstamp template must be one complete block comment or consecutive // comments using LF or CRLF.',
    );

  const parts: string[] = [];
  const fields: Field[] = [];
  const names = new Set<string>();
  let cursor = 0;
  for (const match of template.matchAll(/\{\{([A-Za-z_]\w*)\}\}/g)) {
    const name = match[1];
    const literal = template.slice(cursor, match.index);
    const isAdjacentPlaceholder = fields.length > 0 && literal.length === 0;
    if (isAdjacentPlaceholder) throw new Error('Headstamp placeholders must be separated by literal text.');
    if (names.has(name)) throw new Error(`Headstamp placeholder "${name}" must occur once.`);
    if (!Object.hasOwn(values, name)) throw new Error(`Headstamp placeholder "${name}" has no definition.`);
    const definition = values[name];
    if (!isRecord(definition))
      throw new Error(`Headstamp placeholder "${name}" requires pattern and replacement strings.`);
    const pattern = definition.pattern;
    const replacement = definition.replacement;
    const hasPatternString = typeof pattern === 'string';
    const hasReplacementString = typeof replacement === 'string';
    const hasOnlyValueProperties = Object.keys(definition).length === 2;
    if (!hasPatternString || !hasReplacementString || !hasOnlyValueProperties)
      throw new Error(`Headstamp placeholder "${name}" requires pattern and replacement strings.`);
    const hasMultilineReplacement = /[\r\n\u2028\u2029]/.test(replacement);
    if (hasMultilineReplacement) throw new Error(`Headstamp placeholder "${name}" replacement must be single-line.`);
    let validator: RegExp;
    try {
      validator = fullValuePattern(pattern);
    } catch {
      throw new Error(`Headstamp placeholder "${name}" has an invalid regex.`);
    }
    parts.push(literal);
    fields.push({ name, pattern: validator, replacement });
    names.add(name);
    cursor = match.index + match[0].length;
  }
  parts.push(template.slice(cursor));
  const hasMalformedPlaceholder = parts.some((part) => part.includes('{{') || part.includes('}}'));
  if (hasMalformedPlaceholder) throw new Error('Headstamp placeholders must use {{name}} with an identifier name.');
  if (Object.keys(values).length !== fields.length)
    throw new Error('Headstamp values must define exactly the template placeholders.');

  function render(fieldValues: string[]): string {
    let comment = parts[0];
    for (const [index, value] of fieldValues.entries()) comment += value + parts[index + 1];
    return comment;
  }
  const rendered = render(fields.map((field) => field.replacement));
  if (!isCompleteComment(rendered)) throw new Error('Headstamp replacement values must preserve the complete comment.');
  function inspect(comment: string): { invalidFields: string[]; repaired: string } | 'ambiguous' | null {
    if (fields.length === 0) return comment === template ? { invalidFields: [], repaired: comment } : null;
    const values = matchValues(comment, parts, fields, true) ?? matchValues(comment, parts, fields, false);
    if (values === null || values === 'ambiguous') return values;
    const invalidFields: string[] = [];
    const repairedValues = values.map((value, index) => {
      const field = fields[index];
      if (field.pattern.test(value)) return value;
      invalidFields.push(field.name);
      const hasValidReplacement = field.pattern.test(field.replacement);
      return hasValidReplacement ? field.replacement : value;
    });
    const repaired = render(repairedValues);
    if (repaired === comment) return { invalidFields, repaired };
    const resultingValues = matchValues(repaired, parts, fields, true) ?? matchValues(repaired, parts, fields, false);
    const preservesFieldBoundaries =
      resultingValues !== null &&
      resultingValues !== 'ambiguous' &&
      resultingValues.every((value, index) => value === repairedValues[index]);
    const hasSafeRepair = isCompleteComment(repaired) && preservesFieldBoundaries;
    return { invalidFields, repaired: hasSafeRepair ? repaired : comment };
  }
  const invalidReplacementFields = fields
    .filter((field) => !field.pattern.test(field.replacement))
    .map((field) => field.name);
  const replacementsMatchPatterns = invalidReplacementFields.length === 0;
  const hasAmbiguousGeneratedHeader = replacementsMatchPatterns && inspect(rendered) === 'ambiguous';
  if (hasAmbiguousGeneratedHeader) throw new Error('Headstamp generated header has ambiguous placeholder boundaries.');
  return {
    rendered,
    inspect,
    invalidReplacementFields,
    isAllowedLeadingComment: (comment: string) =>
      allowedLeadingComments.some((allowed) =>
        typeof allowed === 'string' ? allowed === comment : allowed.test(comment),
      ),
  };
}
